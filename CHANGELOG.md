# Changelog

Refmark uses `v0.MINOR.PATCH` until its first stable release, v1.0.0, following neon1's [versioning standard](https://neon1.tech/knowledge/standards/versioning/). Each released version gets an annotated tag on the commit it names, added by the release workflow.

## v0.1.3 - 2026-11-14

### Changed
- The neon1 watch list and the README's scan command use the new names of five neon1 repositories: soc-2-readiness, incident-response-for-small-teams, compliance-basics, phishing-awareness-kit, and household-tech-handbook. The cited file paths follow the renames, so the watch reports the same sources under their new locations.

## v0.1.2 - 2026-11-14

### Changed
- The README and package description now say that Refmark is editorial support: it flags cited sources that changed so a person can review them, and it does not check or guarantee that a document is accurate.
- The README describes the weekly watch as what the workflow is set to do, not as a record of past runs.
- `package.json` now reports the released version. It still said 0.1.0 after v0.1.1.

## v0.1.1 - 2026-11-12

### Changed
- The neon1 watch list adds the 13 new sources cited by There Are No Incidents, neon1's incident response training, for 440 sources on 143 sites.

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
