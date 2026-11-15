# How it works

Refmark asks one question of each cited source: is the part I relied on still what it was when I last read it?

## Ways to detect a change

Refmark uses the first two methods below as cheap signals and builds its answer on the third.

**HTTP validators.** Servers may send an `ETag` or `Last-Modified` date. Sending them back with `If-None-Match` and `If-Modified-Since` lets the server answer `304 Not Modified` without the page. Many servers omit the headers or change them on every response, so a validator can prove a page is unchanged but never that it changed.

**A hash of the whole response.** Hashing raw bytes catches every edit, including rotating banners, build numbers, session tokens, "last updated" stamps, and new footer links. On most modern pages the hash changes daily. It suits only files replaced deliberately, such as PDFs, so Refmark uses it for those (`bytes` mode).

**A hash of scoped, normalized text.** Refmark narrows the page to the part a document relies on, keeps the visible words in order, and hashes that. Navigation, scripts, styles, and whitespace don't matter, and a scope keeps unrelated sections from raising alarms. The same content always gives the same fingerprint on any machine, so it can live in a lockfile and be reviewed in a pull request.

**Semantic comparison.** Embeddings or a language model can judge whether two versions mean the same. That helps with triage, but answers vary between runs and models, cost money per page, and are hard to audit. Refmark leaves meaning to the reviewer and gives them a precise diff and a size rating.

## The pipeline

1. **Resolve.** Rules from the manifest fill in defaults by URL pattern, such as checking a regulation through the publisher's API.
2. **Fetch.** One request per source, with the stored validators, a timeout, a size cap, and one retry for temporary errors. Sources on the same page share a request. At most two requests go to a host at once.
3. **Classify the response.** 404 and 410 mean broken. Refusals, rate limits, server errors, and timeouts mean unreachable, which warns without failing because many sites block automated clients. A short page asking visitors to prove they're human is also unreachable. Refmark reports it, doesn't fingerprint the challenge, and doesn't try to get around it.
4. **Scope.** In order: an explicit selector, heading, fragment, or JSON pointer, then the section a URL's `#fragment` names, then the page's main content. A scope that stops matching is reported as lost, usually because the page was reorganized.
5. **Normalize.** Fold Unicode to NFKC, turn invisible and non-breaking spaces into plain spaces, collapse whitespace, drop empty lines, and remove noise such as review stamps with ignore patterns.
6. **Fingerprint.** SHA-256 over the normalized text, or over the raw bytes in `bytes` mode, stored as `sha256:<hex>`.
7. **Compare.** A fingerprint that differs from the lockfile's is a change. If the accepted text is in the snapshot cache, Refmark runs a line diff and rates the change: minor under 2 percent of lines, major at 20 percent or more, otherwise moderate.

## Why a lockfile

The lockfile turns "I checked my sources" into a record. Accepting a change edits one entry, so a pull request that updates a guide also shows which sources were re-read. The manifest says what to watch and the lockfile says what was last accepted. Neither holds copies of anyone's pages, so both can be published.

Accepted text goes in the snapshot cache (`.refmark/`), which `refmark init` adds to `.gitignore`. In CI, keep it in the build cache. With an empty cache, Refmark still detects changes from fingerprints and fills the cache with unchanged text it fetches, so later reports can show diffs.

## Being a good client

- It sends a `User-Agent` naming the project, and you can add contact details.
- It sends conditional requests, so unchanged pages often cost a header exchange.
- It limits requests per host and retries at most once, honoring short `Retry-After` values.
- Where a publisher asks automated clients to use an API, a rule can point Refmark there. The neon1 manifest does this for eCFR and the Federal Register.
- It treats bot checks and refusals as answers and never imitates a browser or works around them.

## Limits

- Pages built with JavaScript show Refmark only what the server sends. Point a selector at server-rendered content, use the publisher's API through `fetch`, or use `status` mode.
- PDFs are compared byte for byte, so a republished PDF with identical text counts as changed.
- A diff needs the previous accepted text. On a fresh cache, a change shows without a diff until the next acceptance.
