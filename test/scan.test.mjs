// Tests for link discovery in Markdown and HTML and for merging scan results into a manifest
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findLinks, scan, merge } from '../src/scan.mjs';

test('finds Markdown, autolink, reference, and bare links with their titles', () => {
  const md = [
    'See [the rule](https://a.test/rule "Rule") and <https://b.test/x>.',
    'Bare https://c.test/page, then (https://d.test/wiki/Foo_(bar)).',
    'Bold **https://g.test/style)** stays clean.',
    '[ref]: https://e.test/ref',
    '```',
    'https://in-code.test/ignored',
    '```',
  ].join('\n');
  const links = findLinks(md);
  assert.deepEqual(links.map((l) => l.url).sort(), [
    'https://a.test/rule', 'https://b.test/x', 'https://c.test/page', 'https://d.test/wiki/Foo_(bar)', 'https://e.test/ref', 'https://g.test/style',
  ]);
  assert.equal(links.find((l) => l.url === 'https://a.test/rule').title, 'the rule');
});

test('reads HTML anchors and decodes entities', () => {
  const links = findLinks('<p><a class="x" href="https://a.test/?q=1&amp;r=2">The <em>guide</em></a></p>', { html: true });
  assert.deepEqual(links, [{ url: 'https://a.test/?q=1&r=2', title: 'The guide' }]);
});

test('sections limit Markdown to matching headings', () => {
  const md = '# Page\nhttps://body.test/\n## Sources\n- https://src.test/\n### Sub\nhttps://sub.test/\n## Next\nhttps://after.test/';
  assert.deepEqual(findLinks(md, { sections: ['sources'] }).map((l) => l.url), ['https://src.test/', 'https://sub.test/']);
});

test('scan labels citations, honors excludes, and merge keeps manual entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refmark-scan-'));
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'site'));
  writeFileSync(join(dir, 'docs', 'a.md'), '[NIST](https://nist.test/csf) and https://localhost:3000/x');
  writeFileSync(join(dir, 'site', 'b.html'), '<a href="https://nist.test/csf">CSF</a>');
  const found = scan([{ path: dir, label: 'org/repo' }], { exclude: ['/localhost/'], ignorePaths: ['/^org\\/repo\\/site\\//'] });
  assert.deepEqual([...found.keys()], ['https://nist.test/csf']);
  assert.deepEqual([...found.get('https://nist.test/csf').citedIn], ['org/repo/docs/a.md']);

  const manifest = { references: [{ id: 'manual', url: 'https://manual.test/' }, { id: 'old', url: 'https://old.test/', citedIn: ['org/repo/docs/gone.md'] }] };
  const result = merge(manifest, found, ['org/repo'], { prune: true });
  assert.deepEqual(result, { added: 1, removed: 1, total: 2 });
  assert.deepEqual(manifest.references.map((r) => r.id), ['manual', 'nist.test-csf']);
});
