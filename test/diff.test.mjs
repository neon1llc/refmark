// Tests for the line diff, its size score, and the unified view
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, summarize, unified } from '../src/diff.mjs';

// Rebuilding both sides from the script proves it is a valid edit script
function rebuild(ops) {
  return [ops.filter((o) => o.op !== '+').map((o) => o.line), ops.filter((o) => o.op !== '-').map((o) => o.line)];
}

test('produces a valid edit script for random inputs', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const a = Array.from({ length: Math.floor(rand() * 15) }, () => 'abc'[Math.floor(rand() * 3)]);
    const b = Array.from({ length: Math.floor(rand() * 15) }, () => 'abc'[Math.floor(rand() * 3)]);
    assert.deepEqual(rebuild(diffLines(a, b)), [a, b]);
  }
});

test('falls back to a wholesale replacement past the edit limit', () => {
  const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
  const ops = diffLines(a, b, 10);
  assert.deepEqual(rebuild(ops), [a, b]);
  assert.equal(ops.filter((o) => o.op === ' ').length, 0);
});

test('sizes a one-line edit in a long text as minor and a rewrite as major', () => {
  const long = Array.from({ length: 100 }, (_, i) => `line ${i}`);
  const edited = [...long];
  edited[50] = 'line fifty';
  assert.equal(summarize(long.join('\n'), edited.join('\n')).size, 'minor');
  assert.equal(summarize('a\nb\nc', 'x\ny\nz').size, 'major');
});

test('unified view shows context and elides the rest', () => {
  const a = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const b = [...a];
  b[10] = 'changed';
  const view = unified(diffLines(a, b), { context: 1 });
  assert.equal(view, '  l9\n- l10\n+ changed\n  l11');
});
