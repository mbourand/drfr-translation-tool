# 01 — Beta QA page shows `beta` content (read-only)

**Triage label:** ready-for-agent

## Parent

Derived from [PRD — Beta QA Review](../prd-beta-qa-review.md).

## What to build

A new permanent, top-level **Beta QA** page that lets a user browse the translation **content** repository's `beta` branch read-only, in the same shape as the existing Review tab: a file/category browser on the side and, for the selected file, the lines shown with original (VO) and translated (VF) side by side. No editing, no marking, no launching yet — this slice is the walking skeleton everything else hangs off.

The `beta` branch name is a single backend configuration value (e.g. `REPOSITORY_BETA_BRANCH`); the frontend must not hardcode it. Content loads through the existing files-fetching path, pointed at that branch.

**Prefactor (do first):** extract a reusable **read-only** review grid out of the existing Review view so this page consumes it rather than duplicating grid logic. "Make the change easy, then make the easy change." The existing Review view should keep behaving exactly as before after the extraction.

Note: "beta branch" here means a branch in the translation **content** repo, not the tool repo.

## Acceptance criteria

- [ ] A top-level "Beta QA" navigation entry opens a page listing the `beta` branch's files by category, like the Review tab.
- [ ] Selecting a file shows its lines with VO and VF side by side, fully read-only (no edit controls).
- [ ] Technical / non-translatable lines are filtered out, matching existing Review behavior.
- [ ] Text search jumps to matching lines within the file (reuses the existing search component).
- [ ] The `beta` branch name comes from backend configuration; it is not hardcoded in the frontend.
- [ ] The read-only grid is shared with the Review view via extraction; no duplicated grid implementation.
- [ ] The existing Review view is unchanged in behavior after the prefactor.

## Blocked by

None — can start immediately.
