// Manifest and lockfile handling. The manifest (refmark.json) says what to watch and how; the
// lockfile (refmark.lock.json) records the accepted state of each source. Both are plain JSON meant
// to be committed and reviewed.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { compilePattern } from './normalize.mjs';

export const MODES = ['html', 'text', 'json', 'bytes', 'status'];
// Fields a rule may supply to the references it matches
const RULE_FIELDS = ['fetch', 'mode', 'scope', 'ignore', 'defaultIgnore', 'userAgent', 'headers', 'note'];
const SCOPE_KEYS = ['selector', 'heading', 'fragment', 'pointer'];

// ---- Paths ----

// Derives the lockfile and cache locations from the manifest path, so several manifests can share
// a folder: watch/docs.json uses watch/docs.lock.json and watch/.refmark/docs/.
export function pathsFor(manifestPath) {
  const full = resolve(manifestPath);
  const dir = dirname(full);
  const name = basename(full).replace(/\.json$/, '');
  const cache = join(dir, '.refmark', name);
  return {
    manifest: full,
    lock: join(dir, `${name}.lock.json`),
    cache,
    snapshots: join(cache, 'snapshots'),
    pending: join(cache, 'pending'),
    pendingIndex: join(cache, 'pending.json'),
  };
}

// ---- Reading and writing ----

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath} (run "refmark init" to create one)`);
  const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
  data.settings ??= {};
  data.scan ??= {};
  data.references ??= [];
  const problems = validateManifest(data);
  if (problems.length) throw new Error(`manifest ${manifestPath} has problems:\n  ${problems.join('\n  ')}`);
  return data;
}

export function loadLock(lockPath) {
  if (!existsSync(lockPath)) return { version: 1, references: {} };
  const data = JSON.parse(readFileSync(lockPath, 'utf8'));
  data.references ??= {};
  return data;
}

// Writes JSON with a trailing newline and, for the lockfile, references sorted by id so that
// accepting one change produces a one-entry diff.
export function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function saveLock(lockPath, lock) {
  const sorted = Object.fromEntries(Object.keys(lock.references).sort().map((id) => [id, lock.references[id]]));
  saveJson(lockPath, { version: 1, references: sorted });
}

// ---- Validation ----

// Checks the manifest's shape and returns a list of readable problems (empty when sound)
export function validateManifest(data) {
  const problems = [];
  const ids = new Set();
  const tryPatterns = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) return problems.push(`${where} must be a list`);
    for (const p of list) {
      try { compilePattern(p); } catch (err) { problems.push(`${where}: ${err.message}`); }
    }
  };
  tryPatterns(data.scan.exclude, 'scan.exclude');
  (data.rules || []).forEach((rule, i) => {
    const where = `rules[${i}]`;
    if (!rule?.match) return problems.push(`${where}: match is required`);
    tryPatterns([rule.match], `${where}.match`);
    const unknown = Object.keys(rule).filter((k) => k !== 'match' && !RULE_FIELDS.includes(k));
    if (unknown.length) problems.push(`${where}: unknown keys ${unknown.join(', ')}`);
    if (rule.mode && !MODES.includes(rule.mode)) problems.push(`${where}: mode must be one of ${MODES.join(', ')}`);
  });
  tryPatterns(data.scan.ignorePaths, 'scan.ignorePaths');
  data.references.forEach((ref, i) => {
    const where = `references[${i}]${ref?.id ? ` (${ref.id})` : ''}`;
    if (!ref || typeof ref !== 'object') return problems.push(`${where} is not an object`);
    if (!ref.id || !/^[a-z0-9][a-z0-9._-]*$/.test(ref.id)) problems.push(`${where}: id must be lowercase letters, digits, dots, dashes, or underscores`);
    if (ids.has(ref.id)) problems.push(`${where}: duplicate id`);
    ids.add(ref.id);
    try {
      const u = new URL(ref.url);
      if (!/^https?:$/.test(u.protocol)) problems.push(`${where}: url must be http or https`);
    } catch {
      problems.push(`${where}: url is missing or invalid`);
    }
    if (ref.fetch) {
      try { new URL(ref.fetch); } catch { problems.push(`${where}: fetch must be a full URL`); }
    }
    if (ref.mode && !MODES.includes(ref.mode)) problems.push(`${where}: mode must be one of ${MODES.join(', ')}`);
    if (ref.scope) {
      const keys = Object.keys(ref.scope);
      const unknown = keys.filter((k) => !SCOPE_KEYS.includes(k));
      if (unknown.length) problems.push(`${where}: unknown scope keys ${unknown.join(', ')}`);
      if (keys.length > 1) problems.push(`${where}: use one scope key, not ${keys.join(' and ')}`);
    }
    tryPatterns(ref.ignore, `${where}.ignore`);
  });
  return problems;
}

// ---- Rules ----

// Applies the manifest's rules: the first rule whose match fits a reference's URL supplies defaults,
// and the reference's own fields win. A rule's fetch may use $1 to $9 from its match, which is how
// a cited page is checked through an official API (for example eCFR's versioner).
export function effectiveReferences(manifest) {
  const rules = (manifest.rules || []).map((rule) => ({ ...rule, re: compilePattern(rule.match) }));
  return manifest.references.map((ref) => {
    for (const rule of rules) {
      const m = rule.re.exec(ref.url);
      if (!m) continue;
      const defaults = Object.fromEntries(RULE_FIELDS.filter((k) => rule[k] !== undefined).map((k) => [k, rule[k]]));
      if (defaults.fetch) defaults.fetch = fillTemplate(defaults.fetch, m);
      return { ...defaults, ...ref };
    }
    return ref;
  });
}

// Fills $1 to $9 from a match, then drops query parameters left empty by optional groups
function fillTemplate(template, match) {
  const url = new URL(template.replace(/\$(\d)/g, (_, n) => encodeURIComponent(match[Number(n)] ?? '')));
  for (const [key, value] of [...url.searchParams]) if (value === '') url.searchParams.delete(key);
  return url.href;
}

// ---- Identity ----

// Builds a readable id from a URL: host without www, then the path, then the fragment, as a slug.
export function idFromUrl(url, taken = new Set()) {
  const u = new URL(url);
  const raw = [u.hostname.replace(/^www\./, ''), u.pathname, u.hash.slice(1)].join('-');
  let base = raw.toLowerCase()
    .replace(/\.(html?|aspx?|php|pdf)\b/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (base.length > 72) base = base.slice(0, 72).replace(/[-.]+$/, '');
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// A fingerprint of everything that decides what gets hashed. When it differs from the lockfile's,
// the stored hash no longer means the same thing and the source must be accepted again.
export function scopeKey(ref) {
  return JSON.stringify({ fetch: ref.fetch || null, mode: ref.mode || null, scope: ref.scope || null, ignore: ref.ignore || [], defaultIgnore: ref.defaultIgnore !== false });
}

// Finds references by id, by exact URL, or by part of either. An empty query selects all.
export function select(references, queries) {
  if (!queries.length) return references;
  const picked = new Set();
  for (const q of queries) {
    const exact = references.filter((r) => r.id === q || r.url === q);
    const matches = exact.length ? exact : references.filter((r) => r.id.includes(q) || r.url.includes(q));
    if (!matches.length) throw new Error(`no reference matches "${q}"`);
    matches.forEach((r) => picked.add(r));
  }
  return references.filter((r) => picked.has(r));
}
