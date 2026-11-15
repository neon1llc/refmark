# Contributing

Issues and pull requests are welcome.

## Working on the code

```sh
npm ci
npm test
node bin/refmark.mjs --help
```

- Refmark runs on Node.js 20 and later and has one runtime dependency. Open an issue before adding another.
- Every file opens with a comment saying what it's for. Each section, export, and non-obvious rule gets a short comment saying why.
- Tests use Node's built-in test runner and a local HTTP server, with no internet access.
- Use [Conventional Commits](https://www.conventionalcommits.org/), such as `feat(scan): read AsciiDoc links`, on a `feat/`, `fix/`, `docs/`, or `chore/` branch.
- Add a line to `CHANGELOG.md` under "Unreleased" for any change users would notice.
- Releases follow neon1's four [release levels](https://github.com/neon1llc/neon1-corpus/blob/main/corpus/standards/versioning.md#release-levels): Implemented, Verified, Released, and Qualified. A tag marks Released. Qualified means the weekly check has run on real repositories for a month without false alarms.

## Adding to neon1's watch list

`refmark scan` generates `watch/neon1.json` from neon1's repositories. To change what it watches, edit the citing document in its repository. If a source needs a scope or rule, open an issue here.
