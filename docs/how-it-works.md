# How it works

Refmark asks one question of each cited source: is the part I relied on still what it was when I last read it?

## Ways to detect a change

| Method | Verdict |
|---|---|
| **HTTP validators** (`ETag`, `Last-Modified`) | A cheap signal. Many servers omit them or change them on every response. A `304` is the publisher's statement, not verified against the content. |
| **Hash of the whole response** | Catches every edit, including rotating banners, build numbers, and "last updated" stamps, so it changes daily on most modern pages. Used only for files replaced deliberately, such as PDFs (`bytes` mode). |
| **Hash of scoped, normalized text** | What Refmark builds on. Navigation, scripts, styles, and whitespace don't matter, and the same content gives the same fingerprint anywhere, so it can live in a lockfile and be reviewed in a pull request. |
| **Semantic comparison** (embeddings or a language model) | Not used. Answers vary between runs, cost money per page, and are hard to audit. Refmark supplies a precise diff and a size rating and leaves meaning to the reviewer. |

## The pipeline

1. **Resolve.** Rules from the manifest fill in defaults by URL pattern, such as checking a regulation through the publisher's API.
2. **Fetch.** One request per source, with the stored validators, a timeout, a size cap, and one retry for temporary errors, honoring short `Retry-After` values. Sources on the same page share a request. At most two requests per host run at once.
3. **Classify.** 404 and 410 mean broken. Refusals, rate limits, server errors, timeouts, and bot-check pages mean unreachable, which warns without failing. Refmark never fingerprints a challenge or works around it.
4. **Scope.** In order: an explicit selector, heading, fragment, or JSON pointer, then the section a URL's `#fragment` names, then the page's main content. A scope that stops matching is reported as lost, usually after a reorganization.
5. **Normalize.** Fold Unicode to NFKC, collapse whitespace, drop empty lines, and remove noise such as review stamps with ignore patterns.
6. **Fingerprint.** SHA-256 over the normalized text, or the raw bytes in `bytes` mode, stored as `sha256:<hex>`.
7. **Compare.** A fingerprint that differs from the lockfile's is a change. If the accepted text is in the snapshot cache, Refmark diffs the lines and rates the change: minor under 2 percent of lines, major at 20 percent or more, otherwise moderate.

## Why a lockfile

The manifest says what to watch. The lockfile records the state an operator accepted. Accepting a change edits one entry, so a pull request that updates a guide also shows which fingerprints were accepted. It doesn't prove anyone read the source or that it supports the claim. Neither file holds copies of pages, so both can be published.

Accepted text goes in the snapshot cache (`.refmark/`), which `refmark init` adds to `.gitignore`. In CI, keep it in the build cache. With an empty cache, Refmark still detects changes from fingerprints and fills the cache with the unchanged text it fetches. A change shows no diff until the next acceptance.

## Being a good client

Refmark sends a `User-Agent` naming the project (you can add contact details), makes conditional requests, and treats bot checks and refusals as answers. Where a publisher asks automated clients to use an API, a rule can point Refmark there, as the neon1 manifest does for eCFR and the Federal Register.

## Limits

- Pages built with JavaScript show Refmark only what the server sends. Scope to server-rendered content, use the publisher's API through `fetch`, or use `status` mode.
- PDFs are compared byte for byte, so a republished PDF with identical text counts as changed.
