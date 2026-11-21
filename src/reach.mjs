// Reachability history: how long each source has been unreachable. It records dates and counts,
// never page text. The file sits beside the snapshot cache, so a lost cache restarts the ages.

import { existsSync, readFileSync } from 'node:fs';
import { saveJson } from './manifest.mjs';

const DAY = 24 * 60 * 60 * 1000;

// Reads the history, or starts an empty one when the file is missing or unreadable
export function loadReach(path) {
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// Applies one run's results. A source answering again leaves the history, and a source that is
// still unreachable keeps its first date. `known` limits what is kept to ids still in the manifest.
export function updateReach(reach, results, { now = new Date(), known } = {}) {
  const today = now.toISOString().slice(0, 10);
  const next = {};
  for (const [id, entry] of Object.entries(reach)) {
    if (!known || known.has(id)) next[id] = entry;
  }
  for (const r of results) {
    if (r.status === 'unreachable') {
      const before = next[r.id];
      next[r.id] = { since: before?.since || today, last: today, checks: (before?.checks || 0) + 1, error: r.error };
    } else if (r.status !== 'error') {
      delete next[r.id];
    }
  }
  return next;
}

// Copies each unreachable source's history onto its result so reports can show the age
export function annotateReach(results, reach, now = new Date()) {
  const today = Date.parse(now.toISOString().slice(0, 10));
  for (const r of results) {
    const entry = r.status === 'unreachable' ? reach[r.id] : undefined;
    if (!entry) continue;
    r.unreachableSince = entry.since;
    r.unreachableChecks = entry.checks;
    r.unreachableDays = Math.max(0, Math.round((today - Date.parse(entry.since)) / DAY));
  }
  return results;
}

export function saveReach(path, reach) {
  saveJson(path, Object.fromEntries(Object.keys(reach).sort().map((id) => [id, reach[id]])));
}
