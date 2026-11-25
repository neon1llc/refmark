# v1.0 readiness

These are the conditions for calling Refmark v1.0. They describe a target, not a claim that it has been met.

## What the comparison tools establish

- urlwatch shows the value of a local command line, filters, and a local cache. Refmark must keep its baseline reviewable in the repository and explain what is cached locally.
- lychee has a small, documented exit-code contract and separates missing input, runtime errors, and broken links. Refmark must make changes, broken sources, and unreachability similarly predictable for scripts.
- changedetection.io supports richer filters and optional browser fetching, with a service and notification setup. Refmark stays repository-native and must state the limits of its HTTP fetcher rather than imply browser behavior.

Sources: [urlwatch](https://github.com/thp/urlwatch), [lychee](https://github.com/lycheeverse/lychee), and [changedetection.io](https://github.com/dgtlmoon/changedetection.io).

## Exit criteria

- **Install:** A clean machine can install the CLI using the documented package or checkout route and run a local manifest without network access.
- **Platforms:** The supported Node.js release lines and operating systems are explicit and exercised by CI. End-of-life Node versions are not advertised as supported.
- **Commands and statuses:** Commands, options, manifest behavior, JSON output, and exit statuses are documented and tested. A content or source problem is distinct from invalid setup and runtime failure.
- **Errors:** Changed, broken, unreachable, scope-lost, rescoped, new, moved, and fetch-error results have tested meanings. Transient server responses get bounded retries. Incomplete HTTP 202 responses stay unverified, and failed rechecks cannot leave content ready to accept. A refused request is never described as a confirmed outage.
- **Security:** Requests use an honest user agent. Refmark does not imitate browsers or evade bot checks. Snapshot text stays in the ignored local cache or Actions cache and is not committed. Secrets are not required for public-source checks.
- **Upgrade:** Manifest and lockfile formats have explicit schema versions and a documented migration path before they are frozen. Users can validate their files without fetching sources.
- **Docs:** README and Action examples run as written. The docs explain what the hash and rating prove, what they do not prove, how to handle unreachable sources, and how to recover after a lost cache.
- **Maintenance:** CI tests supported Node versions, performs a clean install, scans for secrets, and pins every workflow action to an immutable commit.
- **Use:** The review loop works in at least two outside repositories, with outside users reporting successful installs and useful, honest results.

## Current evidence

The CLI already distinguishes changed, broken, and unreachable sources, records unreachable age, supports JSON output, and has an offline manifest validator. Issue #3 is a useful historical watch report, but its cited repository names are stale and its network failures do not establish source outages or Refmark defects. No outside repository adoption is established by this branch.
