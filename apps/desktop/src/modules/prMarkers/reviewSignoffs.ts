import { z } from 'zod'
import { readMarker } from './prMarkers'

const reviewers = z.array(z.string())
const read = (body: string | null | undefined, name: string): string[] => readMarker(body, name, reviewers) ?? []

/**
 * Reads the four review sign-off lists a translation PR carries in its body — the desktop mirror of
 * the server's `ReviewSignoffs` module. Two lists per stage: correction (`APPROVED_BY` /
 * `REQUESTED_CHANGES`) and QA (`QA_APPROVED_BY` / `QA_REQUESTED_CHANGES`). Lifecycle state is always
 * derived from these counts, never stored (docs/adr/0001-two-stage-translation-review.md); a missing
 * marker (legacy bodies that predate QA) reads as an empty list.
 */
export const reviewSignoffs = {
  approvals: (body: string | null | undefined) => read(body, 'APPROVED_BY'),
  changeRequests: (body: string | null | undefined) => read(body, 'REQUESTED_CHANGES'),
  qaApprovals: (body: string | null | undefined) => read(body, 'QA_APPROVED_BY'),
  qaChangeRequests: (body: string | null | undefined) => read(body, 'QA_REQUESTED_CHANGES')
}

/**
 * The "fresh eyes" rule (mirror of the server's `isEligibleQaReviewer`): a user may act as QA on a
 * translation only if they are **neither the author nor someone who acted as a corrector** on it.
 * Enforced authoritatively on the server; the desktop uses it to hide/disable the QA actions.
 */
export const isEligibleQaReviewer = (body: string | null | undefined, author: string, login: string): boolean =>
  login !== author &&
  !reviewSignoffs.approvals(body).includes(login) &&
  !reviewSignoffs.changeRequests(body).includes(login)
