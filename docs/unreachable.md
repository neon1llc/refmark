# Unreachable sources

Some sites refuse automated requests. Refmark doesn't imitate a browser to get past that. It marks the source unreachable and keeps checking, so the answer to "can we still verify this?" stays visible.

## What the report shows

Every `check` records, per source, the first date it was seen unreachable, the latest, and how many checks failed. Sources that answer again leave the record. Reports list the longest-unreachable first. This example is illustrative:

```text
unreachable (75)
  ftc.gov-business-guidance-privacy-security-data-security  https://www.ftc.gov/business-guidance/privacy-security/data-security
    HTTP 403; unreachable for 21 days (since 2026-11-01), 4 checks
```

A coverage line follows the summary and counts how each source was checked:

```text
Coverage: 260 by page content, 64 through another URL, 41 availability only, 75 not verified
```

That line is from running the neon1 watch on 2026-11-21. "Through another URL" means a `fetch` route, such as an API. A source that never answered counts as not verified whatever route it has.

The history is dates and counts, never page text. It sits in `.refmark/<manifest name>/reach.json` beside the snapshots, so the weekly workflow's cache step keeps it. If the cache is lost, the ages start again.

## Routes, in order of preference

1. **An official API or feed.** Where a publisher asks automated clients to use one, point `fetch` at it. The neon1 manifest does this for eCFR and the Federal Register with [rules](manifest.md#rules). The source keeps its public URL in reports.
2. **Availability only.** `"mode": "status"` asks whether the page answers, not what it says. It suits homepages and tools. It can't catch a rewrite.
3. **An archive copy.** Set `fetch` on the source to the Internet Archive's raw copy, which has no toolbar:

   ```json
   {
     "id": "ftc-data-security",
     "url": "https://www.ftc.gov/business-guidance/privacy-security/data-security",
     "fetch": "https://web.archive.org/web/2id_/https://www.ftc.gov/business-guidance/privacy-security/data-security"
   }
   ```

   On 2026-11-21 a request with Refmark's `User-Agent` got 200 for this form on an ftc.gov page and an hhs.gov page that answered 403 directly. Give each source its own `fetch`. A rule's `$1` is URL-encoded, and that form wasn't tried. Refmark was not run against the archive.

   An archive route has limits. The archive changes only when it crawls the page again, so a changed fingerprint means the archive's copy changed, possibly days or months after the page. An unchanged fingerprint doesn't show the live page is unchanged. Reports say "checked through web.archive.org" for these sources. Use it where a late signal beats none.
4. **Leave it unverified.** Review the source by hand when you revise the documents that cite it. The age in the report shows how long that has been the only check.

Don't change `userAgent` or `headers` to look like a browser. Where a publisher offers contact details for automated clients, put them in the `User-Agent` instead.
