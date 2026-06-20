# 02 — Mark a line & see distinct-QA count (with Option Y caching)

**Triage label:** ready-for-agent

## Parent

Derived from [PRD — Beta QA Review](../prd-beta-qa-review.md).

## What to build

End-to-end per-line verification on the Beta QA page. A QA toggles a line as "viewed by me," and every line shows how many **distinct** QAs have verified that exact content. This slice cuts through all layers: new Postgres table, write/read endpoints, the Option Y backend-fetch read path **with its caching**, and the frontend count column + toggle. The backend supertest seam is established here.

A line's identity is `(filePath, contentHash)`, where `contentHash` hashes **both** VO and VF, exact bytes, no normalisation, combined unambiguously (length-prefixed/delimited), with a **versioned recipe** (e.g. `v1:` prefix). The backend owns hashing. On write it hashes the `(VO, VF)` the client sends (the exact text the QA saw); on read it hashes the `beta` file it fetches itself. Counting is `COUNT(DISTINCT userId)` for the line; open to all authenticated users.

Schema shape (encodes the decision):

```
BetaReviewMark {
  id
  userId      // from the authenticated session
  filePath
  contentHash // backend-computed, versioned, e.g. "v1:..."
  createdAt
  @@unique([userId, filePath, contentHash])
  @@index([filePath, contentHash])
  @@index([filePath, userId])
}
```

API contracts:

```
POST   /beta-reviews/marks   { filePath, original, translated }   // upsert this user's mark
DELETE /beta-reviews/marks   { filePath, original, translated }   // remove this user's mark
GET    /beta-reviews/counts?filePath=...
   -> per-line, aligned to the file: [{ count, markedByMe }, ...]
```

Read path (Option Y, chosen for the low-powered VPS): the client sends only `filePath`. The backend fetches the one viewed `beta` file via the existing ETag-cached GitHub path, hashes its lines, and returns counts. Three caches: (1) `beta` file content (ETag'd, shared); (2) per-file hash list keyed by the file's blob SHA; (3) per-file count map (`contentHash → distinct-user count`), invalidated **only** on a mark/unmark in that file — a `beta` update does not invalidate it. `markedByMe` is a small per-`(filePath, userId)` lookup on top.

## Acceptance criteria

- [ ] Marking a line records the current user's verification of that exact `(filePath, VO, VF)`; the line shows count 1 and "viewed by me".
- [ ] Un-marking removes it; count returns to 0 and "viewed by me" clears.
- [ ] Two different users marking the same line yields count 2; the same user marking twice yields count 1.
- [ ] A line whose VF changes reads count 0 (re-review required); a line unchanged across a `beta` update keeps its count.
- [ ] Two lines with identical VF but different VO have independent counts.
- [ ] The same `(VO, VF)` under a different `filePath` has an independent count.
- [ ] A whitespace-only difference in VF is treated as a different line.
- [ ] The counts endpoint takes only `filePath`; the client does not upload file content to read counts.
- [ ] Hashing is backend-side with a versioned recipe; marks and counts use the same recipe.
- [ ] Repeated count reads of an unchanged file are served from cache; a mark/unmark invalidates that file's count map; a `beta` update does not require count-map invalidation.
- [ ] Backend behavior is covered by supertest e2e tests against a real throwaway Postgres, with `GithubHttpService` and the auth guard replaced by test doubles. Tests assert on counts/toggle behavior, not on hashing or cache internals.

## Blocked by

- 01 — Beta QA page shows `beta` content (read-only)
