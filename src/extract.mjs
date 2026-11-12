// Content extraction: picks the part of a response a reference cares about (its scope) and
// turns it into text, canonical JSON, or raw bytes for hashing.

import { parse } from 'node-html-parser';
import { normalizeText, stableJson, DEFAULT_IGNORE } from './normalize.mjs';

// Elements that never carry readable content
const ALWAYS_DROP = 'script, style, noscript, template, svg, iframe, object, embed, canvas, link, meta, head';

// Site chrome dropped only when no explicit selector is given, so a selector can still target it
const CHROME_DROP = 'nav, header, footer, aside, form, dialog, [role="navigation"], [role="banner"], ' +
  '[role="contentinfo"], [role="search"], [hidden], [aria-hidden="true"]';

// Containers tried in order when a reference has no scope
const DEFAULT_ROOTS = ['main', '[role="main"]', 'article', '#main-content', '#content', 'body'];

// Elements that start a new line in the extracted text
const BLOCK = new Set(['address', 'article', 'blockquote', 'br', 'caption', 'dd', 'details', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'main', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);

const HEADING = /^h([1-6])$/i;

// Chooses how a response is compared, from the reference's explicit mode or the content type.
export function detectMode(reference, contentType = '') {
  if (reference.mode) return reference.mode;
  const type = contentType.toLowerCase();
  if (type.includes('html') || type.includes('xml+xhtml')) return 'html';
  if (type.includes('json')) return 'json';
  if (type.startsWith('text/')) return 'text';
  return 'bytes';
}

// Builds the comparable form of a response. Returns { mode, text?, bytes?, note? }; text is the
// normalized string that is hashed and diffed, bytes is used only in bytes mode.
export function extract(reference, body, contentType) {
  const mode = detectMode(reference, contentType);
  const ignore = [...(reference.defaultIgnore === false ? [] : DEFAULT_IGNORE), ...(reference.ignore || [])];
  if (mode === 'bytes') return { mode, bytes: body };
  const raw = Buffer.from(body).toString('utf8');
  if (mode === 'json') return { mode, text: extractJson(raw, reference.scope?.pointer) };
  if (mode === 'text') return { mode, text: normalizeText(raw, ignore) };
  if (mode === 'html') {
    const { text, note } = extractHtml(raw, reference);
    return { mode, text: normalizeText(text, ignore), note };
  }
  throw new Error(`unknown mode "${mode}"`);
}

// ---- JSON ----

// Resolves an RFC 6901 pointer (for example /data/0/version) and returns canonical JSON.
export function extractJson(raw, pointer) {
  let value = JSON.parse(raw);
  if (pointer) {
    for (const part of pointer.split('/').slice(1)) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (value === null || typeof value !== 'object' || !(key in value)) {
        throw new ScopeError(`JSON pointer ${pointer} not found`);
      }
      value = value[key];
    }
  }
  return stableJson(value);
}

// ---- HTML ----

// Raised when a scope no longer matches the page, which usually means the page was reorganized
export class ScopeError extends Error {}

// Extracts readable text from the scoped part of an HTML page.
export function extractHtml(raw, reference) {
  // <pre> is parsed as markup, not raw text, so code samples lose their tags like everything else
  const root = parse(raw, { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  root.querySelectorAll(ALWAYS_DROP).forEach((el) => el.remove());
  const scope = reference.scope || {};
  const fragment = scope.fragment ?? fragmentOf(reference.url);
  let nodes;
  let note;

  if (scope.selector) {
    nodes = root.querySelectorAll(scope.selector);
    if (!nodes.length) throw new ScopeError(`selector "${scope.selector}" matched nothing`);
  } else if (scope.heading) {
    const heading = root.querySelectorAll('h1, h2, h3, h4, h5, h6')
      .find((h) => h.text.replace(/\s+/g, ' ').trim().toLowerCase().includes(scope.heading.toLowerCase()));
    if (!heading) throw new ScopeError(`heading "${scope.heading}" not found`);
    nodes = sectionFrom(heading);
  } else if (fragment) {
    const target = findById(root, fragment);
    if (target) {
      nodes = sectionFrom(target);
    } else if (scope.fragment) {
      throw new ScopeError(`fragment #${fragment} not found`);
    } else {
      // A link's #anchor may be client-side only; fall back to the whole page, and say so
      note = `#${fragment} not found, compared the whole page`;
    }
  }

  if (!nodes) {
    root.querySelectorAll(CHROME_DROP).forEach((el) => el.remove());
    // Skip-link targets are often empty anchors, so a candidate must hold real text to count
    const container = DEFAULT_ROOTS.map((sel) => root.querySelector(sel))
      .find((el) => el && el.text.replace(/\s+/g, ' ').trim().length >= 200) || root.querySelector('body') || root;
    nodes = [container];
  }
  return { text: nodes.map(textOf).join('\n'), note };
}

// The URL's #fragment, decoded, or undefined
function fragmentOf(url) {
  try {
    const hash = new URL(url).hash.slice(1);
    return hash ? decodeURIComponent(hash) : undefined;
  } catch {
    return undefined;
  }
}

// Finds the element a fragment points at: an id, or a legacy <a name>
function findById(root, id) {
  const quoted = JSON.stringify(id);
  return root.querySelector(`[id=${quoted}]`) || root.querySelector(`a[name=${quoted}]`);
}

// Returns the nodes that make up the section a target starts. A heading's section runs until the
// next heading of the same or higher level. An anchor inside a heading counts as that heading.
// Any other element is its own section.
function sectionFrom(target) {
  let el = target;
  // An empty anchor marks a spot rather than wrapping content: use what follows it
  while (el && !el.text.trim() && !HEADING.test(el.rawTagName || '')) {
    const next = nextElement(el);
    if (!next) break;
    el = next;
  }
  if (!HEADING.test(el.rawTagName || '') && HEADING.test(el.parentNode?.rawTagName || '')) el = el.parentNode;
  const level = HEADING.exec(el.rawTagName || '')?.[1];
  if (!level) return [el];
  const siblings = el.parentNode ? el.parentNode.childNodes : [el];
  const nodes = [];
  for (let i = siblings.indexOf(el); i < siblings.length; i++) {
    const node = siblings[i];
    const other = node !== el && HEADING.exec(node.rawTagName || '')?.[1];
    if (other && Number(other) <= Number(level)) break;
    nodes.push(node);
  }
  return nodes;
}

// The next element after a node in document order, climbing out of parents when needed
function nextElement(node) {
  for (let n = node; n?.parentNode; n = n.parentNode) {
    const siblings = n.parentNode.childNodes;
    for (let i = siblings.indexOf(n) + 1; i < siblings.length; i++) {
      if (siblings[i].nodeType === 1) return siblings[i];
    }
  }
  return null;
}

// Walks a node and returns its visible text with line breaks at block boundaries.
export function textOf(node) {
  const parts = [];
  const walk = (n) => {
    if (n.nodeType === 3) {
      parts.push(n.text);
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n.rawTagName || '').toLowerCase();
    const block = BLOCK.has(tag);
    if (block) parts.push('\n');
    if (tag === 'td' || tag === 'th') parts.push(' | ');
    if (tag === 'img' && n.getAttribute('alt')) parts.push(n.getAttribute('alt'));
    n.childNodes.forEach(walk);
    if (block) parts.push('\n');
  };
  walk(node);
  return parts.join('');
}
