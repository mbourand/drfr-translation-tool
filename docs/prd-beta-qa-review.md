# PRD — Beta QA Review

**Status:** ready-for-agent
**Area:** translation-tool-app (frontend) + translation-tool-back (backend) + new Postgres database

---

## Problem Statement

The team has no way to know whether the translated game content has actually been play-tested, or by how many people. Translations land on `main` through merge requests, but there is no surface where QA testers can systematically go through the content, run the patched game against a stable snapshot, and record that a given line has been verified. Because nothing is recorded, the team cannot answer the basic question "has everything been tested, and by enough independent people to trust it?" Coverage is invisible, so gaps (lines no one has ever checked) and weak spots (lines only one person glanced at) are indistinguishable from thoroughly-vetted content.

## Solution

Introduce a stable `beta` branch in the translation **content** repository, updated out-of-band by the QA lead every 4–5 MRs, and a new permanent **Beta QA** page in the tool dedicated to reviewing it.

On that page a QA can:

- Browse the `beta` branch's files exactly like the existing Review tab (read-only).
- Launch the patched game running the `beta` branch's content, using the existing launch flow.
- Mark any individual line as "viewed by me," and un-mark it.
- See, per line, how many **distinct** QAs have verified that exact line, and whether they themselves have.
- See, per file/chapter, a distribution of review depth ("X lines reviewed ≥1×, Y lines ≥2×, …").

Review marks are tied to the **content** of a line, not its position, so the counts remain honest and self-heal as the `beta` branch is updated: unchanged text keeps its verification history, changed or newly-added text correctly drops back to zero and demands re-review.

## User Stories

1. As a QA tester, I want a dedicated Beta QA page, so that I have one stable place to review release-candidate content without it shifting under me between merge requests.
2. As a QA tester, I want the Beta QA page to show the `beta` branch's files like the Review tab, so that I can read original (VO) and translated (VF) text side-by-side in a familiar layout.
3. As a QA tester, I want to launch the patched game with the `beta` branch's content, so that I can verify how the translations actually look and behave in-game.
4. As a QA tester, I want to mark a specific line as viewed, so that I can record that I personally verified it.
5. As a QA tester, I want to un-mark a line I marked by mistake, so that the recorded counts always reflect the truth.
6. As a QA tester, I want to see how many distinct QAs have verified each line, so that I can prioritise lines that few or no one has checked.
7. As a QA tester, I want my own mark on a line to be visibly distinct ("viewed by me"), so that I can tell at a glance what I have already done.
8. As a QA tester, I want marking the same line twice myself to count only once, so that I cannot accidentally inflate a line's verification count.
9. As a QA tester, I want to scroll through a file to find the line I just saw in-game, so that I can mark it quickly, since dialogue from one sequence is usually packed together in the file.
10. As a QA tester, I want to search for the French text I saw in-game, so that I can jump to the right line when scrolling is not enough.
11. As a QA tester, I want a per-file/per-chapter distribution of review depth, so that I can judge how thoroughly the part I am working on has been tested.
12. As a QA lead, I want lines whose text changed in a `beta` update to reset to zero reviews, so that edited content is never mistaken for already-verified content.
13. As a QA lead, I want a line whose text is unchanged across a `beta` update to keep its verification history, so that QAs do not have to re-verify text that did not change.
14. As a QA lead, I want two different source lines that happen to share an identical translation to be counted separately, so that verifying one does not falsely credit the other.
15. As a QA lead, I want a line that moves to a different chapter file to start fresh at zero, so that it is re-verified in its new context.
16. As a QA lead, I want a stray difference like an extra space to be treated as different text, so that regressions that overflow a dialog box are caught rather than hidden.
17. As a QA lead, I want to update the `beta` branch myself on my own cadence (every 4–5 MRs), so that I control what release-candidate snapshot QA is testing against.
18. As any authenticated user, I want to see the review counts even if I am not actively testing, so that I can understand the current state of coverage.
19. As a developer, I want the backend to stay responsive on a low-powered VPS, so that the feature does not degrade the rest of the tool.
20. As a developer, I want repeated views of the same unchanged file to be served from cache, so that the VPS is not doing redundant work for every QA on every file open.
21. As a QA tester, I want technical/non-translatable lines to be excluded from the Beta QA view and from counts, so that coverage reflects only real translated content.

## Implementation Decisions

### Scope & starting point
- Built on a clean branch off `main`. The previously-prototyped "beta reports" (GitHub-issues bug-tracking) feature is **abandoned upstream** and is **not** present in the working tree; this feature does not build on, remove, or otherwise touch it.

### Branch model
- A single `beta` branch in the translation **content** repository is the source of truth for what QA reviews.
- The branch is updated **externally** (by the QA lead, via git/CI) every 4–5 MRs. The tool never merges or writes to it — it only reads it.
- The branch name is **backend configuration** (e.g. an env var like `REPOSITORY_BETA_BRANCH`). No support for multiple concurrent beta branches in v1.

### Line identity (core decision)
- A reviewable line's identity is `(filePath, contentHash)`.
- `contentHash` is a hash over **both** the original (VO) and translated (VF) text, exact bytes, **no normalisation** (whitespace is significant).
- The two fields are combined unambiguously (length-prefixed / delimited) before hashing so that different `(VO, VF)` splits cannot collide.
- The hash recipe is **versioned** (e.g. a `v1:` prefix on the stored value) so the recipe can change later without silently merging old and new marks.
- Consequences, all intentional:
  - VF text changes → new hash → count resets to 0 (re-review required).
  - Two distinct VO with identical VF → different hashes → separate counts.
  - Line relocates to a different `filePath` → different identity → fresh count (re-verify in new context).
  - Text changes then reverts to a previously-reviewed value → prior marks resurface → count returns (accepted: byte-identical text was genuinely verified before).

### Counting semantics
- The unit is **distinct QA per line**: a line's count is the number of distinct users who have an active mark for that `(filePath, contentHash)`.
- Open to **all authenticated users**. No roles/QA-allowlist and no author-exclusion in v1.

### Hashing location
- **The backend computes the hash** — single, versioned source of truth, easy to update.
- On the **write** path, the backend hashes the `(VO, VF)` **the client sends** (the exact text the QA saw on screen), so a mark records precisely what was verified, independent of later `beta` shifts.
- On the **read** path, the backend hashes the `beta` file it fetches itself (see read path). Both paths use the same recipe, so hashes are consistent.

### Data model (Postgres + Prisma)

Single table; shape encodes the decision:

```
BetaReviewMark {
  id          // primary key
  userId      // GitHub user id, from the authenticated session
  filePath
  contentHash // backend-computed, versioned (e.g. "v1:...")
  createdAt
  @@unique([userId, filePath, contentHash])   // a user marks a given line once
  @@index([filePath, contentHash])
  @@index([filePath, userId])                  // supports "markedByMe" lookups
}
```

Line count = `COUNT(DISTINCT userId) WHERE filePath = ? AND contentHash = ?`.

### API contracts

Write (small payloads; backend hashes the supplied text):

```
POST   /beta-reviews/marks   { filePath, original, translated }   // upsert this user's mark (toggle on)
DELETE /beta-reviews/marks   { filePath, original, translated }   // remove this user's mark (toggle off)
```

Read (Option Y — backend fetches the file, client sends almost nothing):

```
GET /beta-reviews/counts?filePath=...
  -> per-line, aligned to the file's lines: [{ count, markedByMe }, ...]
```

- The user identity comes from the authenticated session, not the request body.
- Per-file/per-chapter review-depth distribution is derived **client-side** from the `counts` response — no dedicated endpoint, no global rollup.

### Read path & caching (Option Y — chosen for low-powered VPS)
- The client does **not** upload file content to read counts. The backend fetches the one viewed `beta` file itself, reusing the existing GitHub access layer (the same ETag-cached path the Review tab uses), so the fetch is shared across all QAs rather than repeated per request.
- Three cache layers keep the VPS idle in the common case:
  1. **`beta` file content** — ETag-cached against GitHub; refetched only when the branch updates that file.
  2. **Per-file hash list** — the file's lines hashed once, keyed by the file's blob SHA; recomputed only when that file's content changes.
  3. **Per-file count map** (`contentHash → distinct-user count`) — in-memory; invalidated **only** when a mark/unmark occurs in that file. (A `beta` update does *not* invalidate it — stale hashes simply stop being looked up.)
- `markedByMe` is a small per-`(filePath, userId)` lookup layered on top of the shared count map.
- Rationale: SHA hashing is negligible; the real VPS cost is parsing large JSON request bodies repeatedly, which Option Y eliminates. The backend becomes aware only of **the single file currently being viewed**, never all files at once.

### Frontend
- A new top-level **Beta QA** route/page.
- Reuses the existing Review grid in a **read-only** variant (no editing), plus:
  - a **review-count column** per line, and
  - a per-row **"viewed by me" toggle** that calls the write endpoints.
- Loads `beta` content through the existing files-fetching path, pointed at the configured `beta` branch.
- Reuses the existing `patchAndLaunchGame` flow **unchanged** to run the game against `beta` — confirmed feasible because the launcher patches from in-memory loaded content and does **not** depend on the local git clone's checked-out branch (the clone is only a working directory for the UndertaleModTool CLI and original `.win` data).
- Inherits the existing technical-string filtering, so non-translatable lines neither appear nor count.

### Assumption to verify during build
- The backend files endpoint accepts an arbitrary non-PR branch name. Very likely true — the Review tab already uses it for `master` — but confirm before relying on it for `beta`.

## Testing Decisions

**What makes a good test here:** exercise the feature through its external HTTP behavior, never its internals. The hash recipe, the three cache layers, and the Prisma queries are implementation details — tests assert on the **counts and toggle behavior** observable through the endpoints, so the caching/hashing can be rewritten without rewriting tests.

**Single seam — backend HTTP, via supertest.** Mirror the existing `test/app.e2e-spec.ts`: boot the Nest app and drive the `beta-reviews` endpoints over HTTP. Behind that seam, two existing dependencies are replaced with test doubles (not new seams — doubles at module boundaries that already exist), and the database is real:

- **`GithubHttpService`** is stubbed to return canned `beta` file content, so a test controls "what beta says."
- **The auth guard** is overridden to set a fixed `userId` per request, so a test can act as two different QAs.
- **Prisma** runs against a **real throwaway test Postgres** — distinct-count and unique-constraint behavior must not be faked.

**Behaviors to cover at this seam:**
- Mark a line, then read counts → count 1, `markedByMe` true for that user.
- Two distinct users mark the same line → count 2.
- The same user marks the same line twice → count stays 1.
- Un-mark → count drops; `markedByMe` false.
- VF text changes between mark and read → that line reads 0.
- Two lines with identical VF but different VO → two independent counts.
- Same `(VO, VF)` under a different `filePath` → independent count.
- Whitespace-only difference in VF → treated as a different line.
- Reading counts for an unchanged file twice does not change results (cache correctness observed through stable output).

**Prior art:** `translation-tool-back/test/app.e2e-spec.ts` (supertest against the booted app) is the pattern to copy. The skeletal `*.controller.spec.ts` "should be defined" specs are **not** the model — they assert nothing behavioral.

**Frontend:** no automated tests in v1. There is no frontend test harness today, the page is a presentational grid column plus a toggle that calls the tested endpoints, and the launcher is native Tauri code. Standing up a harness for this would add a second seam for low value; the behavior worth protecting is covered behind the backend seam.

## Out of Scope

- **Roles / QA-allowlist / author-exclusion** — marking is open to all authenticated users.
- **Global, project-wide coverage rollup** — only per-file/per-chapter distribution. A whole-project percentage would require the backend to load every `beta` file at once.
- **Bulk marking** ("mark whole file/range as viewed") — defeats the per-line verification signal.
- **In-app `beta` branch updates / merge UI** — the QA lead updates the branch out-of-band.
- **Multiple concurrent `beta` branches** — a single configured branch.
- **Automatic, gameplay-derived marking** — the patched game cannot report which lines it displayed, so all marking is explicit and manual.
- **Removing the old "beta reports" (GitHub-issues) feature** — it was never merged and is absent from the working tree; nothing to remove.
- **Frontend automated tests.**

## Further Notes

- Naming caution for implementers: "beta branch" here always means a branch in the translation **content** repository. The translation **tool** repository separately had a `beta` git branch holding the abandoned beta-reports prototype — unrelated.
- The self-healing-on-revert behavior (story 12/13 plus the revert edge case) is a deliberate property of content-based identity, not a bug: counts always reflect verification of the exact bytes currently on screen.
- Performance posture is explicit because the deployment target is a low-powered VPS (Dokploy-managed Postgres + backend). Option Y was chosen specifically to avoid repeated large-body parsing; keep the Prisma connection pool modest.
