// Tests for the unreachable history: ages across runs, recovery, an API route, and the report
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../src/check.mjs';
import { loadReach, updateReach } from '../src/reach.mjs';
import { pathsFor } from '../src/manifest.mjs';
import { formatText, formatMarkdown, coverage } from '../src/report.mjs';

let server;
let origin;
let blocked = true;

// A page that refuses scripts until `blocked` is cleared, an API serving the same page's text, and a plain page
before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/refuses') return blocked ? res.writeHead(403).end('no') : res.writeHead(200, { 'content-type': 'text/html' }).end('<main><p>Open now.</p></main>');
    if (req.url === '/api') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"version":1}');
    if (req.url === '/plain') return res.writeHead(200, { 'content-type': 'text/html' }).end('<main><p>Plain.</p></main>');
    return res.writeHead(404).end('missing');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'refmark-reach-'));
  return pathsFor(join(dir, 'refmark.json'));
}

const day = (n) => new Date(Date.UTC(2026, 10, 1 + n));
const noRetry = { timeout: 5000 };

test('a source keeps its first unreachable date across runs and its age is reported', async () => {
  blocked = true;
  const refs = [{ id: 'refuses', url: `${origin}/refuses` }];
  const paths = workspace();
  let [r] = await check(refs, { references: {} }, noRetry, paths, { now: day(0) });
  assert.equal(r.status, 'unreachable');
  assert.equal(r.unreachableSince, '2026-11-01');
  assert.equal(r.unreachableDays, 0);

  [r] = await check(refs, { references: {} }, noRetry, paths, { now: day(21) });
  assert.equal(r.unreachableSince, '2026-11-01');
  assert.equal(r.unreachableDays, 21);
  assert.equal(r.unreachableChecks, 2);
  assert.match(formatText([r]), /unreachable for 21 days \(since 2026-11-01\), 2 checks/);
  assert.match(formatMarkdown([r], refs), /unreachable for 21 days/);
});

test('a source that answers again leaves the history, and one that fails again starts over', async () => {
  const refs = [{ id: 'refuses', url: `${origin}/refuses` }];
  const paths = workspace();
  blocked = true;
  await check(refs, { references: {} }, noRetry, paths, { now: day(0) });
  blocked = false;
  const [r] = await check(refs, { references: {} }, noRetry, paths, { now: day(7) });
  assert.notEqual(r.status, 'unreachable');
  assert.deepEqual(loadReach(paths.reach), {});

  blocked = true;
  const [again] = await check(refs, { references: {} }, noRetry, paths, { now: day(14) });
  assert.equal(again.unreachableSince, '2026-11-15');
});

test('unreachable sources list the oldest first', () => {
  const stamp = (id, since, days) => ({ id, url: `https://x.test/${id}`, status: 'unreachable', error: 'HTTP 403', unreachableSince: since, unreachableDays: days, unreachableChecks: 3 });
  const text = formatText([stamp('young', '2026-11-18', 3), stamp('old', '2026-10-01', 51), { id: 'fresh', url: 'https://x.test/fresh', status: 'unreachable', error: 'HTTP 403' }]);
  assert.ok(text.indexOf('old') < text.indexOf('young') && text.indexOf('young') < text.indexOf('fresh'));
});

test('history for sources removed from the manifest is dropped, and a subset check keeps the rest', () => {
  const reach = { gone: { since: '2026-11-01', checks: 2 }, kept: { since: '2026-11-01', checks: 2 } };
  const next = updateReach(reach, [], { now: day(1), known: new Set(['kept']) });
  assert.deepEqual(Object.keys(next), ['kept']);
  const subset = updateReach(reach, [{ id: 'other', status: 'same' }], { now: day(1) });
  assert.deepEqual(Object.keys(subset).sort(), ['gone', 'kept']);
});

test('coverage counts each route, and shows a source checked through another URL', async () => {
  blocked = true;
  const refs = [
    { id: 'plain', url: `${origin}/plain` },
    { id: 'api', url: `${origin}/refuses`, fetch: `${origin}/api` },
    { id: 'home', url: `${origin}/plain`, mode: 'status' },
    { id: 'refuses', url: `${origin}/refuses` },
    { id: 'api-down', url: `${origin}/refuses`, fetch: `${origin}/refuses` },
  ];
  const results = await check(refs, { references: {} }, noRetry, workspace(), { now: day(0) });
  assert.deepEqual(coverage(results), { page: 1, through: 1, availability: 1, unverified: 2 });
  assert.match(formatText(results), /Coverage: 1 by page content, 1 through another URL, 1 availability only, 2 not verified/);
  const down = results.find((r) => r.id === 'api-down');
  assert.match(formatText([down]), /checked through 127\.0\.0\.1/);
});
