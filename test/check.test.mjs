// End-to-end tests against a local HTTP server: new, same, changed, moved, broken, scope lost,
// 304 handling, accept, and the CLI's exit codes
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, accept } from '../src/check.mjs';
import { loadLock, pathsFor } from '../src/manifest.mjs';
import { main } from '../src/cli.mjs';

const pages = {};
let server;
let origin;

// Serves whatever is in pages, with an ETag so conditional requests can be tested
before(async () => {
  server = createServer((req, res) => {
    const page = pages[req.url];
    if (!page) return res.writeHead(404).end('missing');
    if (page.redirect) return res.writeHead(301, { location: page.redirect }).end();
    const etag = `"${createHash('sha1').update(page.body).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) return res.writeHead(304).end();
    res.writeHead(200, { 'content-type': page.type || 'text/html', etag }).end(page.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const html = (body) => `<html><body><nav>menu</nav><main><h1>Rule</h1>${body}</main></body></html>`;

// A fresh manifest folder with the given references
function workspace(references) {
  const dir = mkdtempSync(join(tmpdir(), 'refmark-check-'));
  const manifest = join(dir, 'refmark.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, settings: { timeout: 5000 }, references }));
  return { dir, manifest, paths: pathsFor(manifest) };
}

test('a source moves from new to same to changed, with a diff once a snapshot exists', async () => {
  pages['/rule'] = { body: html('<p>Keep logs 90 days.</p>') };
  const refs = [{ id: 'rule', url: `${origin}/rule` }];
  const { paths } = workspace(refs);
  const settings = { timeout: 5000 };

  let [r] = await check(refs, loadLock(paths.lock), settings, paths);
  assert.equal(r.status, 'new');
  await accept(refs, loadLock(paths.lock), settings, paths);
  assert.ok(existsSync(join(paths.snapshots, 'rule.txt')));

  [r] = await check(refs, loadLock(paths.lock), settings, paths);
  assert.equal(r.status, 'same');
  assert.equal(r.notModified, true);

  pages['/rule'] = { body: html('<p>Keep logs 365 days.</p>') };
  [r] = await check(refs, loadLock(paths.lock), settings, paths);
  assert.equal(r.status, 'changed');
  assert.match(r.diff.preview, /- Keep logs 90 days\.\n\+ Keep logs 365 days\./);

  // Accepting uses exactly what the check saw and makes the next check clean
  await accept(refs, loadLock(paths.lock), settings, paths);
  [r] = await check(refs, loadLock(paths.lock), settings, paths);
  assert.equal(r.status, 'same');
});

test('chrome-only edits do not count as changes', async () => {
  pages['/chrome'] = { body: html('<p>Stable.</p>') };
  const refs = [{ id: 'chrome', url: `${origin}/chrome` }];
  const { paths } = workspace(refs);
  await check(refs, loadLock(paths.lock), {}, paths);
  await accept(refs, loadLock(paths.lock), {}, paths);
  pages['/chrome'] = { body: html('<p>Stable.</p>').replace('menu', 'new menu') };
  const [r] = await check(refs, loadLock(paths.lock), {}, paths);
  assert.equal(r.status, 'same');
});

test('broken links, lost scopes, edited scopes, and redirects are reported', async () => {
  pages['/old'] = { redirect: '/new' };
  pages['/new'] = { body: html('<p>Moved here.</p>') };
  pages['/scoped'] = { body: html('<p class="v">v1</p>') };
  const refs = [
    { id: 'gone', url: `${origin}/gone` },
    { id: 'moved', url: `${origin}/old` },
    { id: 'scoped', url: `${origin}/scoped`, scope: { selector: '.v' } },
  ];
  const { paths } = workspace(refs);
  await check(refs, loadLock(paths.lock), {}, paths);
  await accept(refs, loadLock(paths.lock), {}, paths);
  const lock = loadLock(paths.lock);
  assert.equal(lock.references.gone, undefined);
  lock.references.moved.finalUrl = `${origin}/older`;

  pages['/scoped'] = { body: html('<p class="w">v1</p>') };
  let results = await check(refs, lock, {}, paths);
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(by.gone.status, 'broken');
  assert.equal(by.moved.moved, true);
  assert.equal(by.scoped.status, 'scope-lost');

  refs[2].scope = { selector: '.w' };
  results = await check(refs, lock, {}, paths);
  assert.equal(results[2].status, 'rescoped');
});

test('the CLI exits 1 on a change, writes a Markdown report, and validates the lockfile', async () => {
  pages['/cli'] = { body: html('<p>First.</p>') };
  const { dir, manifest } = workspace([{ id: 'cli', url: `${origin}/cli`, title: 'CLI page', citedIn: ['docs/a.md'] }]);
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['accept', '--all', '-m', manifest]), 0);
    assert.equal(await main(['validate', '-m', manifest]), 0);
    assert.equal(await main(['check', '-m', manifest]), 0);
    pages['/cli'] = { body: html('<p>Second.</p>') };
    const report = join(dir, 'report.md');
    assert.equal(await main(['check', '-m', manifest, '--report', report]), 1);
    const md = readFileSync(report, 'utf8');
    assert.match(md, /CLI page/);
    assert.match(md, /Cited in `docs\/a\.md`/);
    assert.match(md, /\+ Second\./);
    assert.equal(await main(['nope']), 2);
  } finally {
    console.log = quiet;
  }
});
