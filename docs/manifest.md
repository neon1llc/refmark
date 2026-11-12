# The manifest format

A manifest is a JSON file, `refmark.json` by default. Refmark reads it on every command and writes it only during `init`, `add`, and `scan`. Its lockfile sits beside it, with `.lock.json` in place of `.json`, and its snapshot cache sits in `.refmark/<name>/` in the same folder.

## Top level

| Field | Type | Purpose |
|---|---|---|
| `version` | number | Format version. Currently `1`. |
| `settings` | object | How sources are fetched. See [Settings](#settings). |
| `scan` | object | What `refmark scan` skips. See [Scan](#scan). |
| `rules` | list | Defaults applied to sources by URL pattern. See [Rules](#rules). |
| `references` | list | The sources. See [References](#references). |

## Settings

| Field | Default | Purpose |
|---|---|---|
| `concurrency` | `8` | Requests in flight at once. |
| `perHost` | `2` | Requests in flight to any one host, so one site is never flooded. |
| `timeout` | `30000` | Milliseconds before a request is abandoned. |
| `userAgent` | `refmark/<version> (+https://github.com/neon1llc/refmark)` | The `User-Agent` header. The `REFMARK_USER_AGENT` environment variable overrides it. Some publishers ask automated clients to include contact details here. |

## Scan

| Field | Purpose |
|---|---|
| `exclude` | Patterns for URLs that are never added, such as your own site, localhost, or font hosts. |
| `ignorePaths` | Patterns for citing files that are skipped, matched against the labeled path (for example `org/repo/site/build/page.html`). Use it for generated copies of documents. |
| `sections` | Heading names. When set, only Markdown under matching headings is read, such as `["Sources", "References"]`. |
| `extensions` | File extensions to read. Defaults to `.md`, `.markdown`, `.mdx`, `.html`, `.htm`, `.txt`, `.rst`, and `.adoc`. |

Scanning always skips hidden folders, `node_modules`, `vendor`, `dist`, `build`, `coverage`, and fenced code blocks in Markdown.

## References

| Field | Required | Purpose |
|---|---|---|
| `id` | Yes | A stable name: lowercase letters, digits, dots, dashes, and underscores. `scan` and `add` derive one from the URL. |
| `url` | Yes | The address your documents cite, including any `#fragment`. |
| `title` | No | A readable name, taken from the link text when scanned. |
| `fetch` | No | A different URL to request, such as an official API for the cited page. Reports still show `url`. |
| `mode` | No | How the response is compared. See [Modes](#modes). Detected from the content type when omitted. |
| `scope` | No | Which part of the response to compare. See [Scopes](#scopes). |
| `ignore` | No | Patterns removed from each line before hashing. |
| `defaultIgnore` | No | Set to `false` to turn off the built-in ignores for review stamps, copyright lines, and skip links. |
| `userAgent` | No | A `User-Agent` for this source only. |
| `headers` | No | Extra request headers for this source, such as `{ "accept": "application/json" }`. |
| `note` | No | Free text for people reading the manifest. |
| `citedIn` | No | Files that cite the source. `scan` maintains it, and reports link to it. |

## Modes

| Mode | Compares | Used for |
|---|---|---|
| `html` | Visible text of the scoped part of the page | Web pages |
| `text` | The response as text | Plain text files |
| `json` | Canonical JSON with sorted keys, optionally scoped by a pointer | APIs and data files |
| `bytes` | The raw response | PDFs, images, and other files |
| `status` | Only whether the source answers | Homepages and tools, where the content is not what a document relies on |

## Scopes

A scope has exactly one key. When a source has none, a `#fragment` in its URL selects that section, and otherwise the page's main content is used: the first of `main`, `[role="main"]`, `article`, `#main-content`, `#content`, or `body` that holds real text, without navigation, headers, footers, asides, forms, and hidden elements.

| Key | Example | Selects |
|---|---|---|
| `selector` | `{ "selector": "#rule-text" }` | Every element matching a CSS selector. |
| `heading` | `{ "heading": "Penalties" }` | The section under the first heading that contains this text, up to the next heading of the same or a higher level. |
| `fragment` | `{ "fragment": "levels" }` | The section an id points to. Unlike a URL fragment, a missing id counts as a lost scope. |
| `pointer` | `{ "pointer": "/data/0/version" }` | A value inside JSON, written as an RFC 6901 pointer. |

## Patterns

`exclude`, `ignorePaths`, `ignore`, and rule `match` values are regular expressions. Write `"/pattern/flags"` to add flags, such as `"/^updated .*$/i"`, or a bare pattern for a case-sensitive match. Remember to double each backslash inside JSON strings.

## Rules

A rule applies defaults to every source whose URL matches it. The first matching rule is used, and fields set on a source override the rule. A rule may set `fetch`, `mode`, `scope`, `ignore`, `defaultIgnore`, `userAgent`, `headers`, and `note`. In `fetch`, `$1` to `$9` insert the match's groups, and query parameters left empty by an optional group are dropped.

This rule checks every cited eCFR section through eCFR's versioner API, which the site asks automated clients to use, and fingerprints the list of amendments:

```json
{
  "match": "/^https:\\/\\/www\\.ecfr\\.gov\\/current\\/title-(\\d+)\\/(?:[^?#]*\\/)?section-([0-9A-Za-z.-]+)\\/?$/",
  "fetch": "https://www.ecfr.gov/api/versioner/v1/versions/title-$1.json?section=$2",
  "mode": "json",
  "scope": { "pointer": "/content_versions" }
}
```

## The lockfile

The lockfile records each source's accepted state: the final URL after redirects, the HTTP status, the content type, the mode, the SHA-256 fingerprint, a key describing the scope settings in force, any `ETag` and `Last-Modified` values, and when it was accepted. Entries are sorted by id, so accepting one source changes one entry. Edit it only through `refmark accept`.
