// Command-line interface: parses arguments and runs one command. Exit codes: 0 when every source
// matches its accepted state, 1 when something needs a person to look, 2 for usage or setup errors.

import { parseArgs } from 'node:util';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { loadManifest, loadLock, saveJson, pathsFor, select, validateManifest, idFromUrl, effectiveReferences } from './manifest.mjs';
import { check, accept, inspect, FAILING } from './check.mjs';
import { scan, merge } from './scan.mjs';
import { formatText, formatMarkdown } from './report.mjs';
import { DEFAULT_USER_AGENT } from './fetch.mjs';

const HELP = `refmark: watch the sources your documents cite and find out when they change

Usage: refmark <command> [options]

Commands
  init                      create refmark.json in this folder
  add <url>                 add a source (--id, --title, --selector, --heading, --mode)
  scan <path>...            find outside links in Markdown and HTML and add them
                              --as <label>    label for each path, in order (repeatable)
                              --sections <a,b> only read Markdown under these headings
                              --prune         drop scanned sources no longer cited
                              --dry-run       print what would change
  check [id|url]...         fetch sources and compare with the lockfile
                              --report <file> write a Markdown report
                              --link-base <url> prefix or template for "cited in" links
                                              ({cite}, {head}, {rest}; see README)
                              --json          print results as JSON
                              --strict        treat unreachable sources as failures
                              -v, --verbose   list unchanged sources and show diffs
  accept [id|url]...        record the current state of sources in the lockfile
                              --all           accept every source and drop stale entries
  show <id|url>             print the text refmark compares for one source
  validate                  check the manifest and lockfile without fetching anything

Options
  -m, --manifest <file>     manifest path (default: refmark.json)
  -h, --help                show this help
`;

// ---- Entry point ----

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        manifest: { type: 'string', short: 'm', default: 'refmark.json' },
        help: { type: 'boolean', short: 'h' },
        verbose: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' },
        strict: { type: 'boolean' },
        report: { type: 'string' },
        'link-base': { type: 'string' },
        all: { type: 'boolean' },
        as: { type: 'string', multiple: true },
        sections: { type: 'string' },
        prune: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        id: { type: 'string' },
        title: { type: 'string' },
        selector: { type: 'string' },
        heading: { type: 'string' },
        mode: { type: 'string' },
      },
    });
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  const { values: opts, positionals } = parsed;
  const [command, ...args] = positionals;
  if (opts.help || !command) {
    console.log(HELP);
    return command || opts.help ? 0 : 2;
  }
  const commands = { init, add, scan: scanCommand, check: checkCommand, accept: acceptCommand, show, validate };
  if (!commands[command]) {
    console.error(`unknown command "${command}"\n\n${HELP}`);
    return 2;
  }
  try {
    return await commands[command](args, opts);
  } catch (err) {
    console.error(`refmark: ${err.message}`);
    return 2;
  }
}

// Effective settings: manifest values, then the environment, then defaults
function settingsFrom(manifest) {
  const s = manifest.settings || {};
  return {
    userAgent: process.env.REFMARK_USER_AGENT || s.userAgent || DEFAULT_USER_AGENT,
    timeout: s.timeout ?? 30000,
    concurrency: s.concurrency ?? 8,
    perHost: s.perHost ?? 2,
  };
}

// ---- Commands ----

// Creates a starter manifest with sensible scan exclusions
async function init(args, opts) {
  if (existsSync(opts.manifest)) throw new Error(`${opts.manifest} already exists`);
  saveJson(opts.manifest, {
    version: 1,
    settings: { concurrency: 8, perHost: 2, timeout: 30000 },
    scan: { exclude: ['/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)/', '/^https?:\\/\\/([a-z0-9-]+\\.)?example\\.(com|org|net)\\b/'] },
    references: [],
  });
  addGitignore(opts.manifest);
  console.log(`created ${opts.manifest}. Next: refmark scan docs/ or refmark add <url>`);
  return 0;
}

// Adds one source by hand
async function add(args, opts) {
  const [url] = args;
  if (!url) throw new Error('add needs a URL');
  const manifest = loadManifest(opts.manifest);
  if (manifest.references.some((r) => r.url === url)) throw new Error(`${url} is already in the manifest`);
  const ref = { id: opts.id || idFromUrl(url, new Set(manifest.references.map((r) => r.id))), url };
  if (opts.title) ref.title = opts.title;
  if (opts.mode) ref.mode = opts.mode;
  if (opts.selector) ref.scope = { selector: opts.selector };
  if (opts.heading) ref.scope = { heading: opts.heading };
  manifest.references.push(ref);
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error(problems.join('\n'));
  saveJson(opts.manifest, manifest);
  console.log(`added ${ref.id}. Run "refmark check ${ref.id}" to see it, then "refmark accept ${ref.id}"`);
  return 0;
}

// Scans documents for outside links and merges them into the manifest
async function scanCommand(args, opts) {
  if (!args.length) throw new Error('scan needs at least one path');
  const manifest = loadManifest(opts.manifest);
  const labels = opts.as || [];
  if (labels.length && labels.length !== args.length) throw new Error('give one --as label per path, in the same order');
  const roots = args.map((path, i) => ({ path: resolve(path), label: labels[i] ?? relative(process.cwd(), resolve(path)).replace(/\\/g, '/') }));
  const found = scan(roots, {
    exclude: manifest.scan.exclude || [],
    ignorePaths: manifest.scan.ignorePaths || [],
    extensions: manifest.scan.extensions,
    sections: opts.sections?.split(',').map((s) => s.trim()).filter(Boolean) ?? manifest.scan.sections,
  });
  const result = merge(manifest, found, roots.map((r) => r.label), { prune: opts.prune });
  console.log(`${found.size} links found: ${result.added} new, ${result.removed} removed, ${result.total} sources in the manifest`);
  if (opts['dry-run']) return 0;
  saveJson(opts.manifest, manifest);
  return 0;
}

// Checks sources against the lockfile and reports what changed
async function checkCommand(args, opts) {
  const manifest = loadManifest(opts.manifest);
  const paths = pathsFor(opts.manifest);
  const lock = loadLock(paths.lock);
  const refs = select(effectiveReferences(manifest), args);
  const tty = process.stderr.isTTY && !opts.json;
  const results = await check(refs, lock, settingsFrom(manifest), paths, {
    onResult: tty ? (r, done, total) => process.stderr.write(`\r${done}/${total} checked`) : undefined,
  });
  if (tty) process.stderr.write('\r\x1b[K');

  if (opts.report) writeFileSync(opts.report, formatMarkdown(results, manifest.references, { linkBase: opts['link-base'] }));
  if (opts.json) console.log(JSON.stringify(results.map(({ text, ...r }) => r), null, 2));
  else console.log(formatText(results, { verbose: opts.verbose }));

  const failing = results.some((r) => FAILING.has(r.status) || (opts.strict && r.status === 'unreachable'));
  return failing ? 1 : 0;
}

// Accepts the current state of the selected sources (or all of them)
async function acceptCommand(args, opts) {
  if (!args.length && !opts.all) throw new Error('name the sources to accept, or use --all');
  const manifest = loadManifest(opts.manifest);
  const paths = pathsFor(opts.manifest);
  const lock = loadLock(paths.lock);
  const refs = opts.all ? effectiveReferences(manifest) : select(effectiveReferences(manifest), args);
  const { accepted, skipped, removed } = await accept(refs, lock, settingsFrom(manifest), paths, { prune: opts.all });
  console.log(`accepted ${accepted.length}${removed.length ? `, removed ${removed.length} stale` : ''}${skipped.length ? `, skipped ${skipped.length}` : ''}`);
  for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
  return skipped.length ? 1 : 0;
}

// Prints the comparable text for one source, which is the quickest way to tune a scope
async function show(args, opts) {
  const manifest = loadManifest(opts.manifest);
  const [ref] = select(effectiveReferences(manifest), args.slice(0, 1));
  if (!ref) throw new Error('show needs one id or URL');
  const r = await inspect(ref, undefined, settingsFrom(manifest));
  if (r.text === undefined) {
    console.log(`${r.status}${r.error ? ': ' + r.error : ''}${r.mode === 'bytes' ? ` (bytes mode, ${r.hash})` : ''}`);
    return r.status === 'new' ? 0 : 1;
  }
  console.log(r.text);
  console.error(`\n${r.mode} mode, ${r.text.split('\n').length} lines, ${r.hash}${r.note ? `, ${r.note}` : ''}`);
  return 0;
}

// Offline consistency check for CI: the manifest is valid and the lockfile matches it
async function validate(args, opts) {
  const manifest = loadManifest(opts.manifest);
  const lock = loadLock(pathsFor(opts.manifest).lock);
  const ids = new Set(manifest.references.map((r) => r.id));
  const stale = Object.keys(lock.references).filter((id) => !ids.has(id));
  const missing = manifest.references.filter((r) => !lock.references[r.id]).map((r) => r.id);
  const wrongUrl = manifest.references.filter((r) => lock.references[r.id] && lock.references[r.id].url !== r.url).map((r) => r.id);
  for (const id of stale) console.log(`stale lock entry: ${id}`);
  for (const id of wrongUrl) console.log(`url differs from lockfile: ${id}`);
  if (missing.length) console.log(`not accepted yet: ${missing.length} (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''})`);
  console.log(`${manifest.references.length} sources, ${Object.keys(lock.references).length} accepted`);
  return stale.length || wrongUrl.length ? 1 : 0;
}

// Keeps the snapshot cache out of version control; it holds copies of other people's pages
function addGitignore(manifestPath) {
  const path = resolve(manifestPath, '..', '.gitignore');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (!/^\.refmark\/?$/m.test(current)) writeFileSync(path, current + (current && !current.endsWith('\n') ? '\n' : '') + '.refmark/\n');
}

