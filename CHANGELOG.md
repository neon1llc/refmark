# Changelog

Refmark uses `v0.MINOR.PATCH` until its first stable release, v1.0.0, following neon1's [versioning standard](https://neon1.tech/knowledge/standards/versioning/). Each released version gets an annotated tag on the commit it names, added by the release workflow.

## Unreleased

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
