# Reporting a problem

Refmark fetches pages from the internet and parses them, so the problems that matter most are ones where a hostile page could make Refmark misbehave: run code, write files outside its cache, or exhaust memory on the machine running it.

- **A security problem:** report it privately through GitHub's "Report a vulnerability" button on this repository, not in a public issue.
- **A wrong result** (a change missed, or a change reported that isn't one): open an issue with the URL, the scope, and the output of `refmark show <id>`.

You'll get a reply within a few days, and credit in the changelog if you want it.
