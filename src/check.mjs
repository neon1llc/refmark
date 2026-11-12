// Checking and accepting: fetches each source, compares it with the lockfile, keeps snapshots for
// diffs, and records accepted state. Nothing here writes the lockfile except accept().

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSource } from './fetch.mjs';
import { extract, ScopeError } from './extract.mjs';
import { hashContent } from './normalize.mjs';
import { summarize, unified } from './diff.mjs';
import { scopeKey, saveLock, saveJson } from './manifest.mjs';
import { runPool } from './pool.mjs';

// What each status means for the exit code: failing statuses need a person to look
export const FAILING = new Set(['changed', 'broken', 'scope-lost', 'rescoped']);
export const WARNING = new Set(['new', 'unreachable', 'error']);

// ---- Inspecting one source ----

// Fetches and compares one reference. Returns a result object; never throws for a bad source.
export async function inspect(ref, entry, settings, fetchCache = new Map()) {
  const base = { id: ref.id, url: ref.url, title: ref.title };
  const keyNow = scopeKey(ref);
  const conditional = entry && entry.scopeKey === keyNow ? { etag: entry.etag, lastModified: entry.lastModified } : {};
  const options = {
    userAgent: ref.userAgent || settings.userAgent,
    timeout: settings.timeout,
    headers: ref.headers,
    ...conditional,
  };

  // Sources that share a page (different #fragments) share one request per run
  // A reference may be checked through another URL (an API) while documents keep citing the page
  const target = ref.fetch || ref.url;
  const cacheKey = JSON.stringify([target.split('#')[0], options.userAgent, conditional]);
  if (!fetchCache.has(cacheKey)) fetchCache.set(cacheKey, fetchSource(target, options));
  const res = await fetchCache.get(cacheKey);

  const http = { http: res.status, finalUrl: res.finalUrl, contentType: res.contentType, etag: res.etag, lastModified: res.lastModified };
  const moved = Boolean(entry?.finalUrl && res.finalUrl && res.status !== 0 && res.finalUrl !== entry.finalUrl);

  if (res.status === 0) {
    // A host that no longer exists is broken; timeouts and resets may pass, so they only warn
    const status = /ENOTFOUND/.test(res.error) ? 'broken' : 'unreachable';
    return { ...base, ...http, status, error: res.error };
  }
  if (res.status === 304) {
    return { ...base, ...http, status: 'same', hash: entry.hash, moved, notModified: true };
  }
  if (!res.body) {
    const status = res.status === 404 || res.status === 410 ? 'broken' : 'unreachable';
    return { ...base, ...http, status, error: `HTTP ${res.status}`, moved };
  }

  // Status mode only asks whether the source still answers, for homepages and tools whose content
  // is not what a document relies on
  if (ref.mode === 'status') {
    const hash = hashContent('reachable');
    const status = !entry ? 'new' : entry.scopeKey !== keyNow ? 'rescoped' : entry.hash === hash ? 'same' : 'changed';
    return { ...base, ...http, mode: 'status', hash, text: 'reachable', moved, scopeKey: keyNow, status, previousHash: entry?.hash };
  }

  let content;
  try {
    content = extract(ref, res.body, res.contentType);
  } catch (err) {
    const status = err instanceof ScopeError ? 'scope-lost' : 'error';
    return { ...base, ...http, status, error: err.message, moved };
  }
  // A bot check served with 200 is not the page. Report it rather than fingerprint it.
  if (content.mode === 'html' && looksLikeBotCheck(content.text)) {
    return { ...base, ...http, status: 'unreachable', error: 'served a bot check instead of the page', moved };
  }
  const hash = hashContent(content.mode === 'bytes' ? content.bytes : content.text);
  const result = { ...base, ...http, mode: content.mode, hash, text: content.text, note: content.note, moved, scopeKey: keyNow };

  if (!entry) result.status = 'new';
  else if (entry.scopeKey !== keyNow) result.status = 'rescoped';
  else if (entry.hash === hash) result.status = 'same';
  else result.status = 'changed';
  if (entry) result.previousHash = entry.hash;
  if (content.mode !== 'bytes' && !content.text) result.note = [result.note, 'scope produced no text'].filter(Boolean).join('; ');
  return result;
}

// ---- Checking a manifest ----

// Checks references and maintains the cache: snapshots for unchanged sources are filled in when
// missing (they equal the accepted text), and changed text is held in pending/ for accept().
export async function check(references, lock, settings, paths, { onResult } = {}) {
  const fetchCache = new Map();
  const results = await runPool(references, (ref) => inspect(ref, lock.references[ref.id], settings, fetchCache), {
    concurrency: settings.concurrency ?? 8,
    perHost: settings.perHost ?? 2,
    hostOf: (ref) => new URL(ref.url).hostname,
    onDone: onResult,
  });

  const pendingIndex = readPending(paths);
  for (const r of results) {
    const snapPath = join(paths.snapshots, `${r.id}.txt`);
    if (r.status === 'same') {
      delete pendingIndex[r.id];
      if (r.text !== undefined && !existsSync(snapPath)) writeText(snapPath, r.text);
    } else if (['changed', 'new', 'rescoped'].includes(r.status)) {
      if (r.status === 'changed' && r.text !== undefined && existsSync(snapPath)) {
        const { added, removed, ratio, size, ops } = summarize(readFileSync(snapPath, 'utf8'), r.text);
        r.diff = { added, removed, ratio, size, preview: unified(ops) };
      }
      if (r.text !== undefined) writeText(join(paths.pending, `${r.id}.txt`), r.text);
      pendingIndex[r.id] = lockEntryFrom(r);
    }
  }
  saveJson(paths.pendingIndex, pendingIndex);
  return results;
}

// ---- Accepting ----

// Records the current state of the selected references in the lockfile. Uses what the last check
// saw when available, so what was reviewed is exactly what is accepted; otherwise fetches now.
export async function accept(references, lock, settings, paths, { prune = false } = {}) {
  const pendingIndex = readPending(paths);
  const accepted = [];
  const skipped = [];
  const fresh = references.filter((r) => !pendingIndex[r.id]);
  const fetched = fresh.length ? await check(fresh, { references: {} }, settings, paths) : [];
  const latest = readPending(paths);

  for (const ref of references) {
    const pending = pendingIndex[ref.id] || latest[ref.id];
    if (!pending) {
      const r = fetched.find((x) => x.id === ref.id);
      skipped.push({ id: ref.id, reason: r ? `${r.status}${r.error ? ': ' + r.error : ''}` : 'nothing to accept' });
      continue;
    }
    lock.references[ref.id] = { ...pending, url: ref.url, acceptedAt: new Date().toISOString() };
    const from = join(paths.pending, `${ref.id}.txt`);
    if (existsSync(from)) {
      mkdirSync(paths.snapshots, { recursive: true });
      renameSync(from, join(paths.snapshots, `${ref.id}.txt`));
    }
    delete latest[ref.id];
    accepted.push(ref.id);
  }

  // With --all, entries for references no longer in the manifest are dropped
  const removed = [];
  if (prune) {
    for (const id of Object.keys(lock.references)) {
      if (!references.some((r) => r.id === id)) {
        delete lock.references[id];
        rmSync(join(paths.snapshots, `${id}.txt`), { force: true });
        removed.push(id);
      }
    }
  }
  saveLock(paths.lock, lock);
  saveJson(paths.pendingIndex, latest);
  return { accepted, skipped, removed };
}

// ---- Helpers ----

// Short pages that ask the visitor to prove they are human. Long pages that merely mention a
// CAPTCHA are left alone.
const BOT_CHECK = /captcha|flagged as (potentially )?automated|verify (that )?you are (a )?human|just a moment\.\.\.|attention required|checking your browser|enable javascript and cookies to continue|access denied/i;
export function looksLikeBotCheck(text) {
  return Boolean(text) && text.split('\n').length < 60 && BOT_CHECK.test(text);
}

// The fields a lockfile entry keeps: enough to compare next time and to explain what was accepted
function lockEntryFrom(r) {
  const entry = { url: r.url, finalUrl: r.finalUrl, http: r.http, contentType: r.contentType, mode: r.mode, hash: r.hash, scopeKey: r.scopeKey };
  if (r.etag) entry.etag = r.etag;
  if (r.lastModified) entry.lastModified = r.lastModified;
  return entry;
}

function readPending(paths) {
  return existsSync(paths.pendingIndex) ? JSON.parse(readFileSync(paths.pendingIndex, 'utf8')) : {};
}

function writeText(path, text) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}
