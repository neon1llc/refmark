# How it works

Refmark answers one question for each source a document cites: is the part I relied on still what it was when I last read it? This page explains how it decides, and why it decides that way.

## Ways to detect a change

There are four common ways to tell whether a web page changed. Refmark uses the first two as cheap signals and builds its answer on the third.

**HTTP validators.** Servers may send an `ETag` or a `Last-Modified` date. Sending them back with `If-None-Match` and `If-Modified-Since` lets the server answer `304 Not Modified` without sending the page. This is fast and polite, but many servers omit the headers or change them on every response, so a validator can prove a page is unchanged and can never prove it changed.

**A hash of the whole response.** Hashing the raw bytes catches every edit, including the ones that don't matter: rotating banners, build numbers, session tokens, "last updated" stamps, and a new link in the footer. On most modern pages the hash changes daily. It is the right choice only for files that are published once and replaced deliberately, such as PDFs, so Refmark uses it for those (`bytes` mode).

**A hash of scoped, normalized text.** Refmark narrows the page to the part a document relies on, keeps only the visible words in order, and hashes that. Navigation, scripts, styles, and whitespace no longer matter, and a scope keeps unrelated sections of a long page from raising alarms. The result is deterministic: the same content always gives the same fingerprint, on any machine, so it can live in a lockfile and be reviewed in a pull request.

**Semantic comparison.** Embeddings or a language model can judge whether two versions mean the same thing. That is useful for triage, but the answer varies between runs and models, costs money per page, and is hard to audit. Refmark leaves meaning to the person reviewing the change and gives them a precise diff and a size rating to work from.

## The pipeline

1. **Resolve.** Rules from the manifest fill in defaults by URL pattern, such as checking a regulation through the publisher's API.
2. **Fetch.** One request per source, with the stored validators, a timeout, a size cap, and one retry for temporary errors. Sources that share a page share a request. No more than two requests go to a host at once.
3. **Classify the response.** 404 and 410 mean broken. Refusals, rate limits, server errors, and timeouts mean unreachable, which warns without failing because many sites block automated clients. A short page that asks the visitor to prove they are human is also unreachable: Refmark reports it instead of fingerprinting the challenge, and does not try to get around it.
4. **Scope.** In order: an explicit selector, heading, fragment, or JSON pointer. Then the section a URL's `#fragment` names. Then the page's main content. A scope that stops matching is reported as lost, since that usually means the page was reorganized.
5. **Normalize.** Unicode is folded to NFKC, invisible and non-breaking spaces become plain spaces, runs of whitespace collapse, empty lines drop, and ignore patterns remove noise such as review stamps.
6. **Fingerprint.** SHA-256 over the normalized text, or over the raw bytes in `bytes` mode, stored as `sha256:<hex>`.
7. **Compare and explain.** A fingerprint that differs from the lockfile's is a change. When the accepted text is in the snapshot cache, Refmark runs a line diff and rates the change: minor under 2 percent of lines, major at 20 percent or more, otherwise moderate.

## Why a lockfile

The lockfile turns "I checked my sources" into a record. Accepting a change edits one entry, so a pull request that updates a guide can also show which sources were re-read. The manifest says what to watch and the lockfile says what was last accepted. Neither contains copies of anyone's pages, so both can be published.

The accepted text itself goes in the snapshot cache (`.refmark/`), which `refmark init` adds to `.gitignore`. In CI, keep it in the build cache. If the cache is empty, Refmark still detects changes from the fingerprints and fills the cache with any unchanged text it fetches, so later reports can show diffs.

## Being a good client

- Refmark identifies itself with a `User-Agent` that names the project, and lets you add contact details.
- It sends conditional requests, so unchanged pages often cost a header exchange.
- It limits requests per host and retries at most once, honoring short `Retry-After` values.
- Where a publisher offers an API and asks automated clients to use it, a rule can point Refmark there. The neon1 manifest does this for eCFR and the Federal Register.
- It treats bot checks and refusals as answers. It never imitates a browser or works around them.

## Limits

- Pages that build their content with JavaScript show Refmark only what the server sends. Point a selector at server-rendered content, use the publisher's API through `fetch`, or use `status` mode.
- PDFs are compared byte for byte, so a republished PDF with identical text still counts as changed.
- A diff needs the previous accepted text. On a fresh cache, a change is detected but shown without a diff until the next acceptance.
