// Text normalization and hashing: turns extracted text into a stable form so that only real
// edits change the hash, not whitespace, Unicode variants, or boilerplate stamps.

import { createHash } from 'node:crypto';

// Lines that change on many sites without any change to what the page says. A reference can
// turn these off with "defaultIgnore": false and supply its own list.
export const DEFAULT_IGNORE = [
  '/^(page )?last (reviewed|updated|modified)\\b.*$/i',
  '/^(content )?(last )?(reviewed|updated|modified) (on|:).*$/i',
  '/^(©|\\(c\\)|copyright\\b).*$/i',
  '/^skip to (main )?content$/i',
];

// Compiles "/pattern/flags" or a bare pattern string into a RegExp. Bare strings are
// case-sensitive, which keeps simple literal ignores predictable.
export function compilePattern(source) {
  if (source instanceof RegExp) return source;
  const m = /^\/(.*)\/([dgimsuvy]*)$/s.exec(source);
  try {
    return m ? new RegExp(m[1], m[2]) : new RegExp(source);
  } catch (err) {
    throw new Error(`invalid ignore pattern ${JSON.stringify(source)}: ${err.message}`);
  }
}

// Normalizes text line by line. Invariant: the output depends only on the visible words and
// their order, so it is safe to hash and diff.
export function normalizeText(text, ignore = []) {
  const patterns = ignore.map(compilePattern);
  const out = [];
  for (let line of text.normalize('NFKC').split(/\r?\n/)) {
    // Non-breaking and zero-width characters are layout, not content
    line = line.replace(/[  -​  　]/g, ' ').replace(/[‌‍﻿]/g, '');
    line = line.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    for (const re of patterns) {
      line = line.replace(re, '').trim();
      if (!line) break;
    }
    if (line) out.push(line);
  }
  return out.join('\n');
}

// Serializes JSON with sorted keys so key order never reads as a change.
export function stableJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2);
}

// Hashes text or bytes with SHA-256, prefixed so the algorithm can change later without
// confusing old lockfiles.
export function hashContent(content) {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}
