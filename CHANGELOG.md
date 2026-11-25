# Changelog

Refmark uses `v0.MINOR.PATCH` until v1.0.0, following neon1's [versioning standard](https://neon1.tech/knowledge/standards/versioning/). The release workflow adds an annotated tag on each version's commit.

## Unreleased

### Changed
- Require Node.js 22 or later, the earliest currently supported LTS line tested by CI.
- Test Node.js 22, 24, and 26 on Linux, macOS, and Windows, install the packed package into a clean prefix, and scan source files for secrets.
- Pin workflow actions to immutable commits, including the action updates from open PR #1.
- The current neon1 watch manifest contains 439 sources; issue #3's 440-source report predates the latest manifest change.

### Added
- [v1.0 readiness criteria](docs/v1-readiness.md) covering install, platform, CLI, errors, security, upgrade, documentation, and outside use.
- A regression test for HTTP 202 responses, which do not contain a completed source representation.

### Fixed
- HTTP 202 responses now report as unreachable instead of recording an empty page as a content change.
- Failed and unverified rechecks clear pending content, so a stale result cannot be accepted as current.

- `check` records how long each source has been unreachable, in `.refmark/<manifest name>/reach.json`, and reports list the longest-unreachable first with the date and number of failed checks. Sources that answer again leave the record.
- A coverage line counts sources checked by page content, through another URL, by availability only, and not verified. A source checked through another URL says so in its report line.
- [Unreachable sources](docs/unreachable.md) explains the history and the routes for a refusing host: an official API, availability only, an archive copy, or manual review.

## v0.1.8 - 2026-11-20

### Changed
- Shorter README, how-it-works page, manifest reference, contributing guide, and `--help` text.
- The security policy gives an email address for vulnerability reports. The repository has no private reporting button.
- The README's demo output and first-run figures match the 440-source watch: 75 sources unreachable, not 77.

## v0.1.7 - 2026-11-19

### Changed
- The README and how-it-works page say that an accepted fingerprint or a `304` response doesn't show a person reviewed a source or that it supports a claim. Newly listed sources aren't monitored until their baseline is accepted.

## v0.1.6 - 2026-11-19

### Changed
- The README states what has been tested and used, lists Refmark's limits (no JavaScript, sites that refuse automated requests, line-count ratings), and pins the example workflow to a release tag.

## v0.1.5 - 2026-11-15

### Changed
- Cut wording that repeated a table, list, or linked page.
- Each release's changelog entry is published as its GitHub release.

## v0.1.4 - 2026-11-15

### Changed
- Shorter, plainer wording in the README, contributing guide, and docs.

## v0.1.3 - 2026-11-14

### Changed
- The neon1 watch list and the README's scan command use the new names of five neon1 repositories: soc-2-readiness, incident-response-for-small-teams, compliance-basics, phishing-awareness-kit, and household-tech-handbook. The watch reports the same sources under their new paths.

## v0.1.2 - 2026-11-14

### Changed
- The README and package description say Refmark is editorial support: it flags cited sources that changed so a person can review them, and it doesn't check that a document is accurate.
- The README describes the weekly watch as what the workflow is set to do, not as a record of past runs.
- `package.json` reports the released version. It still said 0.1.0 after v0.1.1.

## v0.1.1 - 2026-11-12

### Changed
- The neon1 watch list adds 13 sources cited by There Are No Incidents, neon1's incident response training, for 440 sources on 143 sites.

## v0.1.0 - 2026-11-12

### Added
- `refmark check`: fetches each source, scopes and normalizes it, and compares its SHA-256 fingerprint with the lockfile. Reports changed, broken, unreachable, moved, lost-scope, and new sources, with a line diff and a minor, moderate, or major rating when a snapshot is available.
- `refmark accept`: records exactly what the last check saw, so the reviewed state is the accepted state.
- `refmark scan`: finds outside links in Markdown and HTML, records the files that cite each one, and keeps those lists current.
- `refmark init`, `add`, `show`, and `validate`.
- Scopes by CSS selector, heading, id fragment, or JSON pointer, and automatic scoping to a URL's `#fragment`.
- Modes for HTML, text, JSON, raw bytes, and availability only.
- Manifest rules that apply defaults by URL pattern, including checking a cited page through an official API.
- Conditional requests, per-host limits, one retry, and bot-check detection.
- A Markdown report for issues, a composite GitHub Action, and a weekly workflow that watches the 421 sources neon1 cites.
