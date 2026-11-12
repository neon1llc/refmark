// Line diff: Myers' O(ND) algorithm over normalized text, plus a size score and a unified view so
// a reader can tell a typo fix from a rewrite at a glance.

// Computes the edit script between two line arrays. Returns a list of { op, line } with op one of
// ' ' (kept), '-' (removed), '+' (added), in order. Common leading and trailing lines are trimmed
// first, and past maxEdits differences the middle is reported as replaced wholesale, which keeps
// memory bounded on pages that were rewritten.
export function diffLines(a, b, maxEdits = 4000) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const head = a.slice(0, start).map((line) => ({ op: ' ', line }));
  const tail = a.slice(endA).map((line) => ({ op: ' ', line }));
  const middle = myers(a.slice(start, endA), b.slice(start, endB), maxEdits);
  return [...head, ...middle, ...tail];
}

// Myers' algorithm on the trimmed middle. Each pass stores only diagonals -d..d, so memory grows
// with the square of the edit count, not the page length.
function myers(a, b, maxEdits) {
  const n = a.length;
  const m = b.length;
  const replaced = () => [...a.map((line) => ({ op: '-', line })), ...b.map((line) => ({ op: '+', line }))];
  if (!n || !m) return replaced();
  const limit = Math.min(n + m, maxEdits);
  const trace = [];
  let v = new Map([[1, 0]]);
  let found = false;

  // Forward pass: the furthest x reached on each diagonal k = x - y after d edits
  for (let d = 0; d <= limit && !found; d++) {
    const next = new Map();
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      next.set(k, x);
      if (x >= n && y >= m) { found = true; break; }
    }
    trace.push(next);
    v = next;
  }
  if (!found) return replaced();

  // Backtrack from the end, one edit per pass, emitting kept lines along each snake
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && (prev.get(k - 1) ?? -1) < (prev.get(k + 1) ?? -1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = prev.get(prevK);
    const prevY = prevX - prevK;
    while (x > (down ? prevX : prevX + 1) && y > (down ? prevY + 1 : prevY)) { x--; y--; ops.push({ op: ' ', line: a[x] }); }
    if (down) { y--; ops.push({ op: '+', line: b[y] }); } else { x--; ops.push({ op: '-', line: a[x] }); }
  }
  while (x > 0 && y > 0) { x--; y--; ops.push({ op: ' ', line: a[x] }); }
  return ops.reverse();
}

// Summarizes a diff: lines added and removed, and the share of the old text that changed.
// Size is "minor" under 2 percent, "major" at 20 percent or more, otherwise "moderate".
export function summarize(oldText, newText) {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  const ops = diffLines(a, b);
  const added = ops.filter((o) => o.op === '+').length;
  const removed = ops.filter((o) => o.op === '-').length;
  const ratio = Math.max(added, removed) / Math.max(a.length, b.length, 1);
  const size = ratio >= 0.2 ? 'major' : ratio < 0.02 ? 'minor' : 'moderate';
  return { added, removed, ratio: Math.round(ratio * 1000) / 1000, size, ops };
}

// Renders a unified diff with a few lines of context around each change, capped at maxLines.
export function unified(ops, { context = 2, maxLines = 80 } = {}) {
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.op === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = true;
  });
  const out = [];
  let skipped = false;
  for (let i = 0; i < ops.length; i++) {
    if (!keep[i]) {
      skipped = true;
      continue;
    }
    if (skipped && out.length) out.push('...');
    skipped = false;
    out.push(`${ops[i].op} ${ops[i].line}`);
  }
  if (out.length > maxLines) return [...out.slice(0, maxLines), `... ${out.length - maxLines} more lines`].join('\n');
  return out.join('\n');
}
