# 04 — Per-file / per-chapter review-depth distribution

**Triage label:** ready-for-agent

## Parent

Derived from [PRD — Beta QA Review](../prd-beta-qa-review.md).

## What to build

A summary, shown for the file/chapter currently being viewed on the Beta QA page, of how thoroughly its lines have been verified: how many lines have been reviewed by at least 1 distinct QA, at least 2, at least 3, and so on. There is no fixed "done" threshold — it is a distribution, so it never goes stale.

This is derived **client-side** from the existing `GET /beta-reviews/counts` response; no new endpoint and no global/project-wide rollup.

## Acceptance criteria

- [ ] When viewing a file/chapter, a summary shows counts of lines reviewed ≥1×, ≥2×, ≥3×, etc.
- [ ] The distribution is computed from the counts response (no new endpoint, no backend change).
- [ ] The numbers reflect marks/un-marks made in the current session (update when counts change).
- [ ] The summary is scoped to the file/chapter in view, not the whole project.

## Blocked by

- 02 — Mark a line & see distinct-QA count
