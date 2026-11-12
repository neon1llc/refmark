// Scanning: finds the outside links in Markdown and HTML files and merges them into a manifest,
// recording which files cite each one. This is how a manifest stays in step with the documents.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { compilePattern } from './normalize.mjs';
import { idFromUrl } from './manifest.mjs';

export const DEFAULT_EXTENSIONS = ['.md', '.markdown', '.mdx', '.html', '.htm', '.txt', '.rst', '.adoc'];
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage']);

// ---- Walking files ----

// Lists scannable files under a path, skipping hidden folders and dependency or build output
function* walk(path, extensions) {
  const stat = statSync(path);
  if (stat.isFile()) {
    if (extensions.includes(extname(path).toLowerCase())) yield path;
    return;
  }
  for (const name of readdirSync(path).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    yield* walk(join(path, name), extensions);
  }
}

// ---- Finding links ----

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, e) => ENTITIES[e]);
const clean = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

// Returns [{ url, title }] for each outside link in a file's text. Markdown code blocks are
// skipped, since links in examples are not citations. With sections, only Markdown under headings
// whose text matches one of them is read (for example ["Sources", "References"]).
export function findLinks(text, { html = false, sections } = {}) {
  const body = html ? text : markdownBody(text, sections);
  const found = new Map();
  const add = (url, title) => {
    url = decode(url);
    // Trailing punctuation and Markdown emphasis are prose, not URL. A bare URL that ends a
    // parenthetical keeps only its own balanced parentheses.
    for (let prev; prev !== url; ) {
      prev = url;
      url = url.replace(/[.,;:!?'"*_]+$/, '');
      if (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
    }
    try {
      url = new URL(url).href;
    } catch {
      return;
    }
    const existing = found.get(url);
    const t = title && clean(title);
    if (!existing) found.set(url, { url, title: t && t !== url && t.length > 2 ? t : undefined });
    else if (!existing.title && t && t !== url && t.length > 2) existing.title = t;
  };

  for (const m of body.matchAll(/<a\b[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(m[1], m[2]);
  for (const m of body.matchAll(/\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*<?(https?:\/\/[^\s)>]+(?:\([^\s)]*\)[^\s)>]*)*)>?(?:\s+["'][^"']*["'])?\s*\)/g)) add(m[2], m[1]);
  for (const m of body.matchAll(/^\s*\[([^\]]+)\]:\s*<?(https?:\/\/\S+?)>?(?:\s|$)/gm)) add(m[2], m[1]);
  for (const m of body.matchAll(/https?:\/\/[^\s<>"'`\[\]{}|\\^]+/g)) add(m[0]);
  return [...found.values()];
}

// Strips fenced code and, when sections are given, keeps only the matching sections' lines
function markdownBody(text, sections) {
  const wanted = sections?.length ? sections.map((s) => s.toLowerCase()) : undefined;
  const out = [];
  let fence = null;
  let keepLevel = null;
  for (const line of text.split(/\r?\n/)) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && wanted) {
      const level = h[1].length;
      if (keepLevel !== null && level <= keepLevel) keepLevel = null;
      if (wanted.some((w) => h[2].toLowerCase().includes(w))) keepLevel = level;
      continue;
    }
    if (!wanted || keepLevel !== null) out.push(line);
  }
  return out.join('\n');
}

// ---- Scanning roots ----

// Scans each root and returns a Map of url -> { url, title, citedIn: Set of labels }. A root's
// label (default: its path relative to the working folder) prefixes every file it contributes.
// exclude filters URLs; ignorePaths filters files by their labeled path.
export function scan(roots, { exclude = [], ignorePaths = [], extensions = DEFAULT_EXTENSIONS, sections } = {}) {
  const patterns = exclude.map(compilePattern);
  const skip = ignorePaths.map(compilePattern);
  const found = new Map();
  for (const { path, label } of roots) {
    for (const file of walk(path, extensions)) {
      const rel = relative(path, file) || '';
      const cited = [label, rel.replace(/\\/g, '/')].filter(Boolean).join('/');
      // Generated copies of documents (a built site, for example) would only repeat citations
      if (skip.some((re) => re.test(cited))) continue;
      const html = /\.html?$/i.test(file);
      for (const link of findLinks(readFileSync(file, 'utf8'), { html, sections })) {
        if (patterns.some((re) => re.test(link.url))) continue;
        const entry = found.get(link.url) || { url: link.url, title: link.title, citedIn: new Set() };
        entry.title ??= link.title;
        entry.citedIn.add(cited);
        found.set(link.url, entry);
      }
    }
  }
  return found;
}

// Merges scan results into a manifest. Citations under the scanned labels are replaced with what
// was found now; new links become references; with prune, references that were found by a scan
// and are no longer cited anywhere are removed. Returns counts for the summary line.
export function merge(manifest, found, labels, { prune = false } = {}) {
  const under = (c) => labels.some((l) => !l || c === l || c.startsWith(l + '/'));
  const byUrl = new Map(manifest.references.map((r) => [r.url, r]));
  const taken = new Set(manifest.references.map((r) => r.id));
  let added = 0;

  for (const ref of manifest.references) {
    if (ref.citedIn) ref.citedIn = ref.citedIn.filter((c) => !under(c));
  }
  for (const entry of found.values()) {
    let ref = byUrl.get(entry.url);
    if (!ref) {
      const id = idFromUrl(entry.url, taken);
      taken.add(id);
      ref = { id, url: entry.url, ...(entry.title ? { title: entry.title } : {}), citedIn: [] };
      manifest.references.push(ref);
      byUrl.set(entry.url, ref);
      added++;
    }
    ref.citedIn = [...new Set([...(ref.citedIn || []), ...entry.citedIn])].sort();
  }

  const before = manifest.references.length;
  if (prune) manifest.references = manifest.references.filter((r) => !Array.isArray(r.citedIn) || r.citedIn.length);
  manifest.references.sort((a, b) => a.id.localeCompare(b.id));
  return { added, removed: before - manifest.references.length, total: manifest.references.length };
}
