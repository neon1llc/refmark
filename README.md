# Refmark

Flags the sources your documents cite when they change, so a person can review them.

For people whose guides, policies, or knowledge bases cite standards, regulations, agency guidance, or vendor documentation. Refmark fingerprints the part of each source you rely on, rechecks it on demand or on a schedule, and reports what changed, broke, or moved, with a diff.

```text
$ refmark check
changed (1)
  ecfr.gov-current-title-16-section-314.4  https://www.ecfr.gov/current/title-16/section-314.4
    moderate: +6 -2 lines
broken (1)
  cisa.gov-resources-tools-resources-back-business-data  https://www.cisa.gov/resources-tools/resources/back-business-data
    HTTP 404
440 sources checked: 1 changed, 1 broken, 438 unchanged
```

**Status:** pre-1.0 (`v0.x`). Tests cover scoping, normalization, diffing, and the lockfile. neon1's own watch has run in GitHub Actions since 2026-11-14. No one outside neon1 has used it yet. Refmark can't judge whether a document is accurate. It sees only the sources you list, the parts you scope, and the text a server sends.

## Install

Node.js 20 or later.

```sh
npm install --global github:neon1llc/refmark
```

Or clone this repository, run `npm ci`, and use `node bin/refmark.mjs`.

## Quick start

```sh
refmark init                 # creates refmark.json and ignores the snapshot cache
refmark scan docs/           # adds every outside link found in Markdown and HTML
refmark check                # all sources are "new" the first time
refmark accept --all         # records the current state as the baseline
git add refmark.json refmark.lock.json .gitignore
```

After that, `refmark check` exits 1 when a source needs review and 0 when everything matches. Rerun `refmark scan` when your documents change.

## How it works

Refmark narrows each source to the part you rely on (a selector, heading, `#fragment`, or JSON pointer), normalizes the visible text, and stores its SHA-256 in a lockfile you commit. PDFs and other files are hashed byte for byte. A new fingerprint is diffed against the last accepted snapshot and rated minor, moderate, or major. `refmark accept` records the new state after you review. The lockfile diff in your pull request shows what was accepted, not that a person reviewed it. [How it works](docs/how-it-works.md) has the reasoning.

## Commands

| Command | What it does |
|---|---|
| `refmark init` | Creates `refmark.json` and adds `.refmark/` to `.gitignore`. |
| `refmark scan <path>...` | Adds outside links from Markdown and HTML files, with the files that cite them. Options: `--as <label>`, `--sections Sources,References`, `--prune`, `--dry-run`. |
| `refmark add <url>` | Adds one source. Options: `--id`, `--title`, `--selector`, `--heading`, `--mode`. |
| `refmark check [id\|url]...` | Checks all sources, or the ones named. Options: `--report <file>`, `--json`, `--strict`, `-v`. |
| `refmark accept [id\|url]...` | Records the current state of the named sources, or all with `--all`. |
| `refmark show <id\|url>` | Prints the text Refmark compares. Use it to tune a scope. |
| `refmark validate` | Checks the manifest and lockfile without fetching. |

Every command takes `--manifest <file>` (default `refmark.json`).

## Results

| Status | Meaning | Fails `check` |
|---|---|---|
| unchanged | The fingerprint matches the accepted one. | No |
| changed | The scoped content differs from what was accepted. | Yes |
| scope lost | The selector, heading, fragment, or JSON pointer no longer matches, usually after a page reorganization. | Yes |
| scope edited | The manifest's scope or ignore rules changed since acceptance. Accept again. | Yes |
| broken | The server answered 404 or 410, or the host no longer exists. | Yes |
| unreachable | The server refused or timed out (403, 429, 5xx). Warns unless you pass `--strict`. | No |
| new | No accepted state yet. | No |

## Scoping a source

A source needs only an `id` and a `url`. The [manifest reference](docs/manifest.md) lists every field.

```json
{
  "version": 1,
  "references": [
    { "id": "wcag-levels", "url": "https://www.w3.org/WAI/WCAG22/Understanding/conformance#levels" },
    { "id": "csf", "url": "https://www.nist.gov/cyberframework", "scope": { "selector": "#block-nist-www-content" } },
    { "id": "penalties", "url": "https://agency.example.gov/rule", "scope": { "heading": "Penalties" } },
    { "id": "build-noise", "url": "https://docs.example.org/guide", "ignore": ["/^Build \\d+$/"] }
  ]
}
```

The first source has no scope, so its `#levels` fragment selects that section.

## In GitHub Actions

This workflow checks sources every Monday and opens an issue when something needs review:

```yaml
name: sources
on:
  schedule:
    - cron: '0 13 * * 1'
  workflow_dispatch:
permissions:
  contents: read
  issues: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
            - uses: actions/cache@v4
        with:
          path: .refmark
          key: refmark-${{ github.run_id }}
          restore-keys: refmark-
      - id: refmark
        uses: neon1llc/refmark@v0.1.6   # or a commit SHA
        with:
          fail-on-change: 'false'
      - if: steps.refmark.outputs.status == '1'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh issue create --title "Cited sources need review" --body-file refmark-report.md
```

Snapshots hold copies of other people's pages, so keep them in the Actions cache. Commit only the manifest and lockfile.

## Limits

- Refmark doesn't run JavaScript, so a page that builds its text in the browser can't be fingerprinted.
- Many sites refuse automated requests. On the first scheduled run of neon1's watch, 75 of 440 sources, mostly US federal, state, and legal sites, were unreachable (69 answered 403, 4 timed out). Refmark doesn't check them. Review them by hand, or run Refmark from a network those sites allow.
- A changed fingerprint means the scoped text differs, not that the change matters or your document is wrong.
- The rating counts changed lines. It doesn't weigh meaning.

## What this repository watches

[neon1](https://neon1.tech) uses Refmark to learn when a source its published material cites has changed. [`watch/neon1.json`](watch/neon1.json) lists 440 outside sources on 143 sites, with the files that cite each, generated by `refmark scan` (see [CONTRIBUTING.md](CONTRIBUTING.md)). [The watch workflow](.github/workflows/watch.yml) checks them every Monday at 13:17 UTC.

`refmark validate --manifest watch/neon1.json` shows which baselines are accepted and which sources need review. A newly listed source isn't monitored until its baseline is accepted.

## Related tools

- [changedetection.io](https://github.com/dgtlmoon/changedetection.io): self-hosted page watcher with CSS, XPath, and JSON filters.
- [urlwatch](https://github.com/thp/urlwatch): command-line watcher with filters and a local cache.
- [lychee](https://github.com/lycheeverse/lychee): reports broken links in documents, not content changes on working pages.

## License

[MIT](LICENSE). The name Refmark and the neon1 name and marks are not covered by the license.
