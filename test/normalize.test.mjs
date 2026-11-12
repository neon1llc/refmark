// Tests for text normalization, ignore patterns, stable JSON, and hashing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, compilePattern, stableJson, hashContent, DEFAULT_IGNORE } from '../src/normalize.mjs';

test('collapses whitespace, drops blank lines, and folds Unicode variants', () => {
  assert.equal(normalizeText('  Hello   world \n\n\n ﬁne​ '), 'Hello world\nﬁne'.normalize('NFKC'));
});

test('default ignores remove review stamps and copyright lines', () => {
  const text = 'Rule text\nPage last reviewed: March 3, 2026\n© 2026 Agency\nMore rule text';
  assert.equal(normalizeText(text, DEFAULT_IGNORE), 'Rule text\nMore rule text');
});

test('ignore patterns accept /regex/flags and bare strings', () => {
  assert.equal(compilePattern('/abc/i').flags, 'i');
  assert.equal(normalizeText('Build 1234 ok', ['Build \\d+ ']), 'ok');
  assert.throws(() => compilePattern('/(/'), /invalid ignore pattern/);
});

test('stable JSON ignores key order', () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), stableJson({ a: { c: 3, d: 2 }, b: 1 }));
});

test('hashes carry their algorithm', () => {
  assert.match(hashContent('x'), /^sha256:[0-9a-f]{64}$/);
});
