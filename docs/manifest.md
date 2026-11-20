# The manifest format

A manifest is a JSON file, `refmark.json` by default. Every command reads it, and only `init`, `add`, and `scan` write it. The lockfile sits beside it as `.lock.json`.

Top-level fields: `version` (currently `1`), `settings`, `scan`, `rules`, and `references`.

## Settings

| Field | Default | Purpose |
|---|---|---|
| `concurrency` | `8` | Requests in flight at once. |
| `perHost` | `2` | Requests in flight to one host. |
| `timeout` | `30000` | Milliseconds before a request is abandoned. |
| `userAgent` | `refmark/<version> (+https://github.com/neon1llc/refmark)` | The `User-Agent` header. `REFMARK_USER_AGENT` overrides it. Some publishers want contact details here. |

## Scan

| Field | Purpose |
|---|---|
| `exclude` | URLs never added, such as your own site, localhost, or font hosts. |
| `ignorePaths` | Citing files to skip, matched against the labeled path (for example `org/repo/site/build/page.html`). Use it for generated copies of documents. |
| `sections` | When set, only Markdown under matching headings is read, such as `["Sources", "References"]`. |
| `extensions` | File extensions to read. Defaults to `.md`, `.markdown`, `.mdx`, `.html`, `.htm`, `.txt`, `.rst`, and `.adoc`. |

`scan` always skips hidden folders, `node_modules`, `vendor`, `dist`, `build`, `coverage`, and Markdown code blocks.

## References

| Field | Required | Purpose |
|---|---|---|
| `id` | Yes | A stable name of lowercase letters, digits, dots, dashes, and underscores. `scan` and `add` derive one from the URL. |
| `url` | Yes | The address your documents cite, including any `#fragment`. |
| `fetch` | No | A different URL to request, such as an official API. Reports still show `url`. |
| `mode` | No | How the response is compared. Detected from the content type when omitted. |
| `scope` | No | Which part of the response to compare. |
| `ignore` | No | Patterns removed from each line before hashing. |
| `defaultIgnore` | No | `false` turns off the built-in ignores for review stamps, copyright lines, and skip links. |
| `userAgent`, `headers` | No | Per-source `User-Agent` or request headers. |
| `title`, `note` | No | Readable name (from the link text when scanned) and free text. |
| `citedIn` | No | Files that cite the source. `scan` maintains it, and reports link to it. |

## Modes

| Mode | Compares | Used for |
|---|---|---|
| `html` | Visible text of the scoped part of the page | Web pages |
| `text` | The response as text | Plain text files |
| `json` | Canonical JSON with sorted keys, optionally scoped by a pointer | APIs and data files |
| `bytes` | The raw response | PDFs, images, other files |
| `status` | Only whether the source answers | Homepages and tools |

## Scopes

A scope has exactly one key. With no scope, a `#fragment` in the URL selects that section. Otherwise Refmark uses the first of `main`, `[role="main"]`, `article`, `#main-content`, `#content`, or `body` that holds real text, minus navigation, headers, footers, asides, forms, and hidden elements.

| Key | Example | Selects |
|---|---|---|
| `selector` | `{ "selector": "#rule-text" }` | Every element matching a CSS selector. |
| `heading` | `{ "heading": "Penalties" }` | The section under the first heading containing this text, up to the next heading of the same or a higher level. |
| `fragment` | `{ "fragment": "levels" }` | The section an id points to. Unlike a URL fragment, a missing id counts as a lost scope. |
| `pointer` | `{ "pointer": "/data/0/version" }` | A JSON value, as an RFC 6901 pointer. |

## Patterns

`exclude`, `ignorePaths`, `ignore`, and rule `match` values are regular expressions. Write `"/pattern/flags"` to add flags, such as `"/^updated .*$/i"`. A bare pattern is case-sensitive. Double each backslash inside JSON strings.

## Rules

A rule sets defaults for every source whose URL matches. The first matching rule wins, and fields on a source override it. A rule may set `fetch`, `mode`, `scope`, `ignore`, `defaultIgnore`, `userAgent`, `headers`, and `note`. In `fetch`, `$1` to `$9` insert the match's groups, and query parameters left empty by an optional group are dropped.

This rule checks eCFR sections through eCFR's versioner API, which the site asks automated clients to use, and fingerprints the amendment list:

```json
{
  "match": "/^https:\\/\\/www\\.ecfr\\.gov\\/current\\/title-(\\d+)\\/(?:[^?#]*\\/)?section-([0-9A-Za-z.-]+)\\/?$/",
  "fetch": "https://www.ecfr.gov/api/versioner/v1/versions/title-$1.json?section=$2",
  "mode": "json",
  "scope": { "pointer": "/content_versions" }
}
```

## The lockfile

Each entry records a source's final URL after redirects, HTTP status, content type, mode, SHA-256 fingerprint, a key for the scope settings, any `ETag` and `Last-Modified` values, and the acceptance time. Edit the file only with `refmark accept`.
