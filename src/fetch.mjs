// HTTP fetching: one polite request per source per run, with conditional headers, a timeout, a size
// cap, and a single retry for errors that are usually temporary.

import { readFileSync } from 'node:fs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const DEFAULT_USER_AGENT = `refmark/${VERSION} (+https://github.com/neon1llc/refmark)`;
const MAX_BYTES = 25 * 1024 * 1024;

// Statuses that are worth one more try after a pause
const RETRY = new Set([429, 500, 502, 503, 504]);

// Fetches a URL (without its #fragment). Returns { status, finalUrl, contentType, etag,
// lastModified, body } where body is a Uint8Array, or null on 304 Not Modified. Network failures
// come back as { status: 0, error } so a single bad host never stops a run.
export async function fetchSource(url, { userAgent = DEFAULT_USER_AGENT, timeout = 30000, etag, lastModified, retries = 1, headers = {} } = {}) {
  const target = url.split('#')[0];
  const request = {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
    'accept-language': 'en-US,en;q=0.8',
    ...headers,
  };
  if (etag) request['if-none-match'] = etag;
  if (lastModified) request['if-modified-since'] = lastModified;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(target, { headers: request, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
      if (RETRY.has(res.status) && attempt < retries) {
        await res.body?.cancel();
        await pause(retryDelay(res));
        continue;
      }
      const result = {
        status: res.status,
        finalUrl: res.url || target,
        contentType: res.headers.get('content-type') || '',
        etag: res.headers.get('etag') || undefined,
        lastModified: res.headers.get('last-modified') || undefined,
        body: null,
      };
      if (res.status === 304 || !res.ok) {
        await res.body?.cancel();
        return result;
      }
      result.body = await readCapped(res);
      return result;
    } catch (err) {
      if (attempt < retries) {
        await pause(2000);
        continue;
      }
      return { status: 0, finalUrl: target, error: describe(err) };
    }
  }
}

// Reads a response body, refusing anything past the size cap so one huge file can't exhaust memory
async function readCapped(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error(`response larger than ${MAX_BYTES} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Honors a short Retry-After, otherwise waits a few seconds
function retryDelay(res) {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 30 ? seconds * 1000 : 3000;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Turns fetch's nested errors into one readable line
function describe(err) {
  if (err?.name === 'TimeoutError') return 'timed out';
  const cause = err?.cause;
  return cause?.code ? `${cause.code}${cause.hostname ? ' ' + cause.hostname : ''}` : err?.message || String(err);
}
