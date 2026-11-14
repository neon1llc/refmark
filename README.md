# Refmark

Flags the sources your documents cite when they change, so a person can review them.

Guides, training material, policies, and knowledge bases lean on outside sources: standards, regulations, agency guidance, and vendor documentation. Those pages are revised, reorganized, and retired without notice, and a document that cited them correctly last year may need another look today. Refmark records a fingerprint of the part of each source you rely on, checks it when you run it or on a schedule you set, and reports what changed, what broke, and what moved, with a diff of the changed text. A check might report:

```text
$ refmark check
changed (1)
  ecfr.gov-current-title-16-section-314.4  https://www.ecfr.gov/current/title-16/section-314.4
    moderate: +6 -2 lines
broken (1)
  cisa.gov-resources-tools-resources-back-business-data  https://www.cisa.gov/resources-tools/resources/back-business-data
    HTTP 404
421 sources checked: 1 changed, 1 broken, 419 unchanged
```

Refmark is editorial support. It tells you that a cited source changed, so a person can read the change and decide whether the document needs updating. It does not judge whether a document is accurate, and it cannot promise that a document stays accurate: it only sees the sources you list, only the parts you scope, and only the text a server sends.

## How it works

1. **Scope.** Each source names the part of the page that matters: a CSS selector, a heading, the section a link's `#fragment` points to, or a JSON pointer. Without a scope, Refmark reads the page's main content and leaves out navigation, headers, footers, and scripts.
2. **Normalize.** The scoped text is reduced to its visible words, one block per line, with whitespace and Unicode variants folded and review stamps such as "Page last reviewed" removed.
3. **Fingerprint.** The normalized text is hashed with SHA-256 and stored in a lockfile you commit. PDFs and other files are hashed byte for byte.
4. **Compare.** Each check sends the stored `ETag` and `Last-Modified` values, so an unchanged page often costs one short request. When the fingerprint differs, Refmark diffs the text against the last accepted snapshot and rates the change as minor, moderate, or major.
5. **Accept.** After you review a change and update your documents, `refmark accept` records the new state. The lockfile diff in your pull request shows exactly which sources were re-reviewed.

[How it works](docs/how-it-works.md) explains these choices and compares them with other approaches.

## Install

Refmark needs Node.js 20 or later.

```sh
npm install --global github:neon1llc/refmark
```

Or clone this repository, run `npm ci`, and use `node bin/refmark.mjs`.

## Quick start

```sh
refmark init                 # creates refmark.json and ignores the snapshot cache
refmark scan docs/           # adds every outside link found in Markdown and HTML
refmark check                # fetches each source; all are "new" the first time
refmark accept --all         # records the current state as the baseline
git add refmark.json refmark.lock.json .gitignore
```

From then on, `refmark check` exits with 1 when a source needs review and 0 when everything matches. Run `refmark scan` again whenever your documents change, and it keeps each source's list of citing files up to date.

## Commands

| Command | What it does |
|---|---|
| `refmark init` | Creates `refmark.json` with common exclusions and adds `.refmark/` to `.gitignore`. |
| `refmark scan <path>...` | Finds outside links in Markdown and HTML files and adds them, with the files that cite them. `--as <label>` names each path, `--sections Sources,References` reads only those Markdown sections, `--prune` drops sources no longer cited, and `--dry-run` only reports. |
| `refmark add <url>` | Adds one source by hand, with optional `--id`, `--title`, `--selector`, `--heading`, or `--mode`. |
| `refmark check [id\|url]...` | Checks all sources, or the ones named. `--report <file>` writes a Markdown report, `--json` prints results, `--strict` fails on unreachable sources, and `-v` shows unchanged sources and diffs. |
| `refmark accept [id\|url]...` | Records the current state of the named sources, or of all of them with `--all` (which also drops lockfile entries for removed sources). |
| `refmark show <id\|url>` | Prints the exact text Refmark compares for a source. Use it to tune a scope. |
| `refmark validate` | Checks the manifest and lockfile without fetching anything. Suited to CI on every push. |

Every command takes `--manifest <file>` (default `refmark.json`). The lockfile sits beside the manifest with `.lock.json` in place of `.json`.

## Results

| Status | Meaning | Fails `check` |
|---|---|---|
| unchanged | The fingerprint matches the accepted one. | No |
| changed | The scoped content differs from what was accepted. | Yes |
| scope lost | The selector, heading, fragment, or JSON pointer no longer matches, which usually means the page was reorganized. | Yes |
| scope edited | The manifest's scope or ignore rules changed since the source was accepted, so it must be accepted again. | Yes |
| broken | The server answered 404 or 410, or the host no longer exists. | Yes |
| unreachable | The server refused or timed out (403, 429, 5xx, timeouts). Many sites block automated requests, so this only warns unless you pass `--strict`. | No |
| new | The source has no accepted state yet. | No |

A result also notes when a source now redirects somewhere other than where it did when accepted.

## Scoping a source

The manifest is plain JSON. A source needs an `id` and a `url`. Everything else is optional.

```json
{
  "version": 1,
  "settings": { "concurrency": 8, "perHost": 2, "timeout": 30000 },
  "scan": { "exclude": ["/^https:\\/\\/docs\\.mysite\\.com/"], "ignorePaths": ["/^site\\/build\\//"] },
  "references": [
    { "id": "wcag-levels", "url": "https://www.w3.org/WAI/WCAG22/Understanding/conformance#levels" },
    { "id": "csf", "url": "https://www.nist.gov/cyberframework", "scope": { "selector": "#block-nist-www-content" } },
    { "id": "penalties", "url": "https://agency.example.gov/rule", "scope": { "heading": "Penalties" } },
    { "id": "release", "url": "https://api.example.org/release.json", "scope": { "pointer": "/version" } },
    { "id": "build-noise", "url": "https://docs.example.org/guide", "ignore": ["/^Build \\d+$/"] }
  ]
}
```

The first source has no scope, so its `#levels` fragment selects that section of the page. [The manifest format](docs/manifest.md) lists every field.

## In GitHub Actions

Refmark ships as an action. This workflow is set to check sources every Monday and to open an issue when something needs review:

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
      # Keeps accepted snapshots between runs so reports can show diffs
      - uses: actions/cache@v4
        with:
          path: .refmark
          key: refmark-${{ github.run_id }}
          restore-keys: refmark-
      - id: refmark
        uses: neon1llc/refmark@main   # pin to a commit SHA for stability
        with:
          fail-on-change: 'false'
      - if: steps.refmark.outputs.status == '1'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh issue create --title "Cited sources need review" --body-file refmark-report.md
```

Snapshots hold copies of other people's pages, so keep them in the Actions cache rather than in the repository. Only the manifest and lockfile, which hold URLs and fingerprints, belong in version control.

## What this repository watches

Refmark began as the way [neon1](https://neon1.tech) finds out when a source its published material cites has changed. [`watch/neon1.json`](watch/neon1.json) lists the 440 outside sources, on 143 sites, cited across neon1's knowledge corpus, website, and education repositories, and [the watch workflow](.github/workflows/watch.yml) is set to check them every Monday at 13:17 UTC. Each source lists the files that cite it, so a change leads straight to the pages that need another look.

The list is rebuilt from fresh clones of those repositories:

```sh
refmark scan --manifest watch/neon1.json --prune \
  ../neon1-corpus ../neon1-site ../soc-2-readiness ../phishing-awareness-kit \
  ../household-tech-handbook ../ready-secure-go ../compliance-basics \
  ../incident-response-for-small-teams \
  --as neon1llc/neon1-corpus --as neon1llc/neon1-site --as neon1llc/soc-2-readiness \
  --as neon1llc/phishing-awareness-kit --as neon1llc/household-tech-handbook \
  --as neon1llc/ready-secure-go --as neon1llc/compliance-basics \
  --as neon1llc/incident-response-for-small-teams
```

## Related tools

- [changedetection.io](https://github.com/dgtlmoon/changedetection.io) is a self-hosted web app for watching pages, with CSS, XPath, and JSON filters, visual selection, and many notification channels. It suits watching many pages by hand from a dashboard.
- [urlwatch](https://github.com/thp/urlwatch) is a command-line watcher with a chain of filters and a local cache. It suits personal monitoring from one machine.
- [lychee](https://github.com/lycheeverse/lychee) checks links in documents and reports the broken ones. It does not notice when a working page's content changes.

Refmark starts from the documents instead of the pages: it finds what they cite, keeps a reviewable baseline in the repository, and points each change back to the files that rely on it.

## License

[MIT](LICENSE). The name Refmark and the neon1 name and marks are not covered by the license.
