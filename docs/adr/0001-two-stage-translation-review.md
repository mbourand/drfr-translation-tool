# Two-stage translation review: correction then QA

A translation now passes two sequential review gates before a staff member merges it:
**correction** (two corrector approvals) then **QA** ("À tester", two QA approvals). Both
gates' sign-offs are stored as marker lists in the **PR body** — the existing
`APPROVED_BY` / `REQUESTED_CHANGES` for correctors, plus new `QA_APPROVED_BY` /
`QA_REQUESTED_CHANGES` for QA — and every lifecycle column is **derived** from these
counts rather than stored as state. Reaching two corrector approvals moves a translation
into QA automatically.

## Decisions worth not "fixing" later

- **A QA change-request keeps the corrector approvals.** When a QA requests changes, the
  translation drops to the shared **Changements demandés** column; on resubmit it returns
  *straight to QA*, because its two corrector approvals are untouched. QA-driven edits are
  deliberately **not** re-vetted by correctors. This was chosen for velocity over the
  stricter alternative (wipe corrector approvals, force re-correction). The return
  destination is derived from the corrector-approval count, so the origin stage is never
  stored.

- **Review state lives in the PR body, not the database.** Correctors already encode
  sign-offs as body markers; QA extends the same `ReviewSignoffs` `SignoffKind` mechanism
  rather than introducing a table. This keeps all of a translation's review state
  travelling with its PR. (Contrast the separate _Relecture de la beta_ feature, which is
  DB-backed because it tracks high-cardinality per-line marks — a different problem.)

- **No role system, but a "fresh eyes" rule.** Eligibility to QA a translation (must be
  neither the author nor someone in that PR's corrector approvals/change-requests) is
  *computed from the PR's own sign-off lists*, not from stored roles. This preserves the
  codebase's existing identity-based, permissionless trust model while still guaranteeing
  QA is a genuinely independent set of reviewers.

## Consequences

- The Overview columns are recomputed from marker counts; the old **Relecture effectuée**
  column is removed and **Changements demandés** is shared by both review stages.
- A translation requires at least four distinct people (author + 2 correctors + 2 QAs)
  to reach release, since QA approvals must come from non-correctors.
- `submit-to-review` clears both the corrector and QA change-request lists on resubmit.
