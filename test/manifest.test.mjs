// Tests for manifest validation, ids, selection, and derived paths
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, idFromUrl, select, pathsFor, scopeKey } from '../src/manifest.mjs';

const base = (references) => ({ settings: {}, scan: {}, references });

test('accepts a sound manifest and reports each problem in a broken one', () => {
  assert.deepEqual(validateManifest(base([{ id: 'a', url: 'https://a.test/', scope: { selector: 'main' } }])), []);
  const problems = validateManifest(base([
    { id: 'Bad Id', url: 'ftp://x' },
    { id: 'dup', url: 'https://a.test/' },
    { id: 'dup', url: 'https://b.test/', mode: 'pdf', scope: { selector: 'a', heading: 'b' }, ignore: ['/(/'] },
  ]));
  assert.equal(problems.length, 6);
});

test('ids are readable, bounded, and unique', () => {
  assert.equal(idFromUrl('https://www.nist.gov/cyberframework'), 'nist.gov-cyberframework');
  assert.equal(idFromUrl('https://a.test/doc.pdf#sec-2'), 'a.test-doc-sec-2');
  assert.equal(idFromUrl('https://a.test/x', new Set(['a.test-x'])), 'a.test-x-2');
  assert.ok(idFromUrl('https://a.test/' + 'long-path/'.repeat(20)).length <= 72);
});

test('select matches exact ids first, then parts of ids or URLs', () => {
  const refs = [{ id: 'nist-csf', url: 'https://nist.test/csf' }, { id: 'nist-csf-2', url: 'https://nist.test/csf2' }];
  assert.deepEqual(select(refs, ['nist-csf']).map((r) => r.id), ['nist-csf']);
  assert.equal(select(refs, ['nist']).length, 2);
  assert.throws(() => select(refs, ['nope']), /no reference matches/);
});

test('paths sit beside the manifest and scope keys track what is hashed', () => {
  const p = pathsFor('/x/watch/docs.json');
  assert.equal(p.lock, '/x/watch/docs.lock.json');
  assert.equal(p.snapshots, '/x/watch/.refmark/docs/snapshots');
  assert.notEqual(scopeKey({ scope: { selector: 'main' } }), scopeKey({}));
});
