// Reporting: a terminal summary for people running checks by hand, and a Markdown report for
// issues and pull requests in CI.

const ORDER = ['changed', 'scope-lost', 'rescoped', 'broken', 'unreachable', 'error', 'new', 'same'];

const LABEL = {
  changed: 'changed',
  'scope-lost': 'scope lost',
  rescoped: 'scope edited, accept again',
  broken: 'broken',
  unreachable: 'unreachable',
  error: 'error',
  new: 'new, not accepted yet',
  same: 'unchanged',
};

// Groups results by status in a fixed order of urgency
function grouped(results) {
  return ORDER.map((status) => [status, results.filter((r) => r.status === status)]).filter(([, list]) => list.length);
}

// One line describing why a result matters
function detail(r) {
  const bits = [];
  if (r.diff) bits.push(`${r.diff.size}: +${r.diff.added} -${r.diff.removed} lines`);
  if (r.error) bits.push(r.error);
  if (r.moved) bits.push(`now at ${r.finalUrl}`);
  if (r.note) bits.push(r.note);
  return bits.join('; ');
}

// ---- Terminal ----

export function formatText(results, { verbose = false } = {}) {
  const lines = [];
  for (const [status, list] of grouped(results)) {
    if (status === 'same' && !verbose) continue;
    lines.push(`${LABEL[status]} (${list.length})`);
    for (const r of list) {
      const d = detail(r);
      lines.push(`  ${r.id}  ${r.url}${d ? `\n    ${d}` : ''}`);
      if (verbose && r.diff?.preview) lines.push(r.diff.preview.split('\n').map((l) => '      ' + l).join('\n'));
    }
  }
  lines.push(summaryLine(results));
  return lines.join('\n');
}

export function summaryLine(results) {
  const counts = grouped(results).map(([status, list]) => `${list.length} ${LABEL[status].split(',')[0]}`);
  return `${results.length} sources checked: ${counts.join(', ')}`;
}

// ---- Markdown ----

// Builds a Markdown report. citedIn and a link base (for example a GitHub blob URL) let each entry
// point at the documents that rely on it.
export function formatMarkdown(results, references, { title = 'Sources changed', linkBase } = {}) {
  const byId = new Map(references.map((r) => [r.id, r]));
  const out = [`## ${title}`, '', summaryLine(results), ''];
  for (const [status, list] of grouped(results)) {
    if (status === 'same') continue;
    out.push(`### ${LABEL[status][0].toUpperCase()}${LABEL[status].slice(1)} (${list.length})`, '');
    for (const r of list) {
      const ref = byId.get(r.id) || {};
      const name = ref.title ? `${escape(ref.title)} (\`${r.id}\`)` : `\`${r.id}\``;
      out.push(`- [${name}](${r.url})${detail(r) ? `: ${escape(detail(r))}` : ''}`);
      if (ref.citedIn?.length) {
        const cites = ref.citedIn.slice(0, 8).map((c) => (linkBase ? `[${c}](${citeLink(linkBase, c)})` : `\`${c}\``));
        out.push(`  - Cited in ${cites.join(', ')}${ref.citedIn.length > 8 ? `, and ${ref.citedIn.length - 8} more` : ''}`);
      }
      if (r.diff?.preview) {
        out.push('', '  <details><summary>What changed</summary>', '', '  ```diff');
        out.push(...r.diff.preview.split('\n').map((l) => '  ' + l), '  ```', '', '  </details>', '');
      }
    }
    out.push('');
  }
  out.push('Review each source, update the documents that cite it if needed, then run `refmark accept <id>` and commit the lockfile.');
  return out.join('\n') + '\n';
}

// Turns a citation into a link. A base without tokens is a plain prefix. Tokens: {cite} is the whole
// citation, {head} its first two segments (owner/repo), {rest} the remainder (the file path), so
// https://github.com/{head}/blob/HEAD/{rest} links citations across several repositories.
export function citeLink(base, cite) {
  if (!/\{(cite|head|rest)\}/.test(base)) return base + cite;
  const parts = cite.split('/');
  return base.replace(/\{cite\}/g, cite).replace(/\{head\}/g, parts.slice(0, 2).join('/')).replace(/\{rest\}/g, parts.slice(2).join('/'));
}

// Keeps titles from breaking Markdown links
function escape(s) {
  return String(s).replace(/([\[\]])/g, '\\$1');
}
