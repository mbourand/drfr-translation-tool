# Beta QA: OK is personal, but any QA can clear a line's KO

A Beta QA verdict is per-(QA, line): OK (tested, no bug) or KO (tested, found a bug), mutually exclusive, replacing the old binary "relu" mark. We deliberately made the two verdicts' permissions **asymmetric**: a QA's OK is private — only its author can change or remove it — but a line's KO can be cleared by *any* QA, which removes every QA's KO on that line at once. This is so a reported bug isn't stuck flagged when the QA who reported it is unavailable; the bug itself is discussed and triaged on Discord, not in-tool, so the in-tool KO is only a "this line needs attention" signal that anyone present can resolve.

A line counts as KO whenever its KO count ≥ 1 regardless of how many OKs it also has (**KO prevails**): one reported bug outranks any number of "looks fine" verdicts.

## Considered Options

- **Symmetric ownership (only the author clears their own KO)** — rejected: a real bug would stay flagged indefinitely if its reporter went absent, defeating the point of an at-a-glance KO view.
- **KO as a single shared line-level flag with no per-QA attribution** — rejected: it collapses KO to a boolean and discards the KO count, which we want shown separately from the OK count.

## Consequences

- The API has three operations: `POST /marks { verdict }` (set/replace my verdict), `DELETE /marks` (clear my own verdict — misclick recovery), and a line-level `DELETE /marks/ko` (clear everyone's KO on that line).
- A line-level KO clear is destructive across users and unaudited in-tool; that is accepted because the source of truth for the bug is Discord.
- Verdicts remain identity-scoped by `(filePath, contentHash)`, so a beta build that edits a line's text changes its hash and the prior OK/KO simply stops matching (a fixed line reads as non relu again) — no special invalidation needed.
