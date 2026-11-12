// Tests for scoping and text extraction from HTML and JSON
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, extractHtml, extractJson, detectMode, ScopeError } from '../src/extract.mjs';

const page = `<!doctype html><html><head><title>T</title><script>var x = 1</script></head><body>
<header><nav>Home | About</nav></header>
<a id="main-content"></a>
<main>
  <h1>Standard</h1>
  <p>Intro paragraph that is long enough to count as the main content of this page. ${'Words '.repeat(40)}</p>
  <h2 id="scope">Scope</h2>
  <p>Applies to <strong>all</strong> systems.</p>
  <h3>Detail</h3>
  <p>Nested detail stays in the section.</p>
  <h2 id="next">Next</h2>
  <p>Outside the section.</p>
  <table><tr><th>Level</th><td>AA</td></tr></table>
</main>
<footer>Copyright 2026</footer>
</body></html>`;

test('default scope reads <main> and drops chrome and scripts', () => {
  const { text } = extractHtml(page, { url: 'https://a.test/' });
  assert.match(text, /Applies to all systems/);
  assert.doesNotMatch(text, /Home \| About|var x|Copyright/);
});

test('a URL fragment scopes to its heading section, including deeper headings', () => {
  const { text } = extract({ url: 'https://a.test/#scope' }, Buffer.from(page), 'text/html');
  assert.equal(text, 'Scope\nApplies to all systems.\nDetail\nNested detail stays in the section.');
});

test('a missing fragment falls back to the page with a note, unless the scope demands it', () => {
  const r = extractHtml(page, { url: 'https://a.test/#gone' });
  assert.match(r.note, /#gone not found/);
  assert.throws(() => extractHtml(page, { url: 'https://a.test/', scope: { fragment: 'gone' } }), ScopeError);
});

test('selector and heading scopes', () => {
  assert.match(extractHtml(page, { url: 'https://a.test/', scope: { selector: 'table' } }).text, /Level.*AA/s);
  assert.match(extractHtml(page, { url: 'https://a.test/', scope: { heading: 'next' } }).text, /Outside the section/);
  assert.throws(() => extractHtml(page, { url: 'https://a.test/', scope: { selector: '.nope' } }), /matched nothing/);
});

test('an empty skip-link anchor is not mistaken for the content', () => {
  const noMain = page.replace(/<\/?main>/g, '');
  const { text } = extractHtml(noMain, { url: 'https://a.test/' });
  assert.match(text, /Applies to all systems/);
});

test('JSON pointer scope and canonical output', () => {
  assert.equal(extractJson('{"data":[{"v":"4.0.1","x":1}]}', '/data/0/v'), '"4.0.1"');
  assert.throws(() => extractJson('{"a":1}', '/b'), ScopeError);
});

test('mode follows content type unless set', () => {
  assert.equal(detectMode({}, 'application/pdf'), 'bytes');
  assert.equal(detectMode({}, 'application/json; charset=utf-8'), 'json');
  assert.equal(detectMode({}, 'text/plain'), 'text');
  assert.equal(detectMode({ mode: 'text' }, 'text/html'), 'text');
});

test('code samples in <pre> lose their markup', () => {
  const { text } = extractHtml('<main><pre><div class="copy">Copy</div><code>curl https://x.test</code></pre></main>', { url: 'https://a.test/', scope: { selector: 'pre' } });
  assert.doesNotMatch(text, /<div|<code/);
  assert.match(text, /curl https:\/\/x\.test/);
});
