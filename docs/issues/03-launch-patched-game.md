# 03 — Launch the patched game from Beta QA

**Triage label:** ready-for-agent

## Parent

Derived from [PRD — Beta QA Review](../prd-beta-qa-review.md).

## What to build

Let a QA run the patched game directly from the Beta QA page, using the `beta` branch's content currently loaded in the view. This is pure reuse of the existing launch flow (`patchAndLaunchGame`), which patches from in-memory loaded content and does not depend on the local git clone's checked-out branch — so pointing it at `beta` requires no new Rust and no local checkout step.

## Acceptance criteria

- [ ] The Beta QA page exposes a launch control (matching the Edit/Review launch UX, including any save-file selection it requires).
- [ ] Launching patches and runs the game using the `beta` content loaded in the page.
- [ ] The running game reflects the `beta` branch's translations.
- [ ] The existing Edit/Review launch behavior is unchanged (no regression from any shared code).

## Blocked by

- 01 — Beta QA page shows `beta` content (read-only)
