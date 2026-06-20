# Desktop

The Tauri + Vite + TypeScript desktop app — the translator/reviewer UI. It models the
life of a translation as it moves from drafting through review to release. The lifecycle
*states* are not stored; they are derived from the backing pull request (labels + review
sign-offs).

## Language

### The work

**Translation**:
A unit of proposed changes to the game's French text, covering one or more file pairs,
that moves through review before being released. Backed by a single GitHub pull request.
_Avoid_: PR (in user-facing language), task, ticket.

**File pair**:
An original/translated file couple (e.g. `chapitre-0/strings_en.txt` ↔ `strings_fr.txt`)
that a translation may change.

### Review workflow

A translation passes two sequential review stages — **correction** then **QA** — before
release. Each stage records sign-offs (approvals / change-requests) as a list of the
people who gave them.

**Correction review** (_Relecture_):
The first stage. Correctors read a translation and either approve it or request changes.
Two corrector approvals advance the translation to QA.

**QA review**:
The second stage ("À tester"). QA reviewers re-read the same changes and approve or
request changes before release. A QA reviewer must be **neither the author nor someone who
acted as a corrector** on that translation — i.e. not in the corrector approvals or
corrector change-requests (fresh eyes). Two QA approvals pass QA; the translation then sits
in À tester flagged ready for a staff merge. QA sign-offs are stored separately from the
corrector ones, so a QA change-request does not disturb the corrector approvals.
_Avoid_: conflating with _Relecture de la beta_ (see below) — different feature.

**Approval**:
A reviewer's sign-off that a translation is good as-is, recorded against their identity.
Scoped to a stage: a *corrector approval* and a *QA approval* are distinct.

**Change request**:
A reviewer's sign-off that a translation needs work. Mutually exclusive with an approval
from the same person in the same stage.

### Roles

There is **no enforced role system**; any authenticated user may act, with the
constraints above. "Corrector" and "QA reviewer" name *what a person is doing on this
translation*, not a stored role.

**Author**:
The person who created the translation (the PR author). May not approve or QA their own
translation.

**Corrector** (_Relecteur_):
Whoever reviews a translation in the correction stage.

**QA reviewer** (_QA_):
Whoever reviews a translation in the QA stage. Distinct from a _beta tester_.

### Not to be confused

**Relecture de la beta** (_Beta QA_):
A separate feature — line-level verification of the game's beta *build*, played in-game,
tracked as per-line marks. **Not** the QA review stage above, which is PR-diff review of a
single translation. Keep the two distinct in conversation and code.

### Lifecycle states

States are derived (from PR state, labels, and sign-offs), not stored. Board order:

**En cours** (_WIP_): being drafted by its author; not yet submitted for review.
**Changements demandés**: a reviewer — corrector _or_ QA — has requested changes; awaiting
the author's fixes. Shared by both review stages; a translation here carries at least one
open change-request. On resubmit the change-requests are cleared and the translation
returns to whichever stage its **corrector-approval count** implies — back to **À tester**
if it still has two corrector approvals (QA-driven edits are _not_ re-vetted by correctors),
otherwise to **En attente de relecture**. The origin stage is never stored; it is derived.
**En attente de relecture**: submitted, awaiting correction review.
**À tester**: has two corrector approvals; undergoing QA review. Also holds QA-passed
translations (flagged ready) awaiting a staff merge — no separate "ready" column.
**Terminée**: released (the PR is merged).

The dropped **Relecture effectuée** column no longer exists: two corrector approvals now
flow straight into **À tester**.

### The game pipeline

How a translation is patched into a local copy of the game and play-tested. Distinct from the review workflow above.

**Game folder**:
The Deltarune Steam installation directory the translator points the tool at, so it can patch and launch the game. On Linux this is the same Windows build run through Steam Proton, with an identical layout.
_Avoid_: game directory, install path.

**UTMT CLI**:
UndertaleModTool's command-line patcher (UndertaleModCli) the tool drives to import translated strings into a chapter's binary Data file.
_Avoid_: UndertaleModCli.exe, UMT, the modding tool.

**Patch target**:
The file inside the Game folder that a translation file maps to and that the tool rewrites — either a binary Data file or a Text resource. Carried by the `pathInGameFolder` field.
_Avoid_: game path, output file.

**Data file**:
The binary GameMaker archive (`data.win`) holding a chapter's strings; patched indirectly through the UTMT CLI, never written directly.
_Avoid_: data.win blob, archive.

**Text resource**:
A plain-text game file (e.g. a chapter's lang JSON) that the tool replaces directly, without the UTMT CLI.
_Avoid_: lang file, json.

**Test save**:
A Deltarune save the tool downloads and drops into the saves folder so the translator starts a play-test at the spot relevant to their changes.
_Avoid_: savegame, save slot.
