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

// Groups results by status in a fixed order of urgency. Unreachable sources list the longest
// unreachable first, since those are the ones to move to another route or drop.
function grouped(results) {
  return ORDER.map((status) => [status, results.filter((r) => r.status === status)])
    .filter(([, list]) => list.length)
    .map(([status, list]) => [status, status === 'unreachable' ? [...list].sort(byAge) : list]);
}

// Oldest first; sources with no history sort after those with one
function byAge(a, b) {
  return (a.unreachableSince || '9999').localeCompare(b.unreachableSince || '9999') || a.id.localeCompare(b.id);
}

// How long a source has been unreachable, in words
function ageText(r) {
  if (!r.unreachableSince) return '';
  const days = r.unreachableDays;
  const since = days === 0 ? 'unreachable today' : `unreachable for ${days} ${days === 1 ? 'day' : 'days'} (since ${r.unreachableSince})`;
  return `${since}, ${r.unreachableChecks} ${r.unreachableChecks === 1 ? 'check' : 'checks'}`;
}

// One line describing why a result matters
function detail(r) {
  const bits = [];
  if (r.diff) bits.push(`${r.diff.size}: +${r.diff.added} -${r.diff.removed} lines`);
  if (r.error) bits.push(r.error);
  if (r.status === 'unreachable') bits.push(ageText(r));
  if (r.via && r.status !== 'same') bits.push(`checked through ${r.via}`);
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
  lines.push(summaryLine(results), coverageLine(results));
  return lines.join('\n');
}

// How each source was checked: by its own page, through another URL, by availability only, or
// not at all. A source that never answered counts as not verified whatever route it was given.
export function coverage(results) {
  const tally = { page: 0, through: 0, availability: 0, unverified: 0 };
  for (const r of results) {
    if (r.status === 'unreachable' || r.status === 'error') tally.unverified++;
    else if (r.via) tally.through++;
    else if (r.mode === 'status') tally.availability++;
    else tally.page++;
  }
  return tally;
}

export function coverageLine(results) {
  const c = coverage(results);
  return `Coverage: ${c.page} by page content, ${c.through} through another URL, ${c.availability} availability only, ${c.unverified} not verified`;
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
  const out = [`## ${title}`, '', summaryLine(results), '', coverageLine(results), ''];
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
