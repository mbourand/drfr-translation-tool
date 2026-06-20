import { ReviewSignoffs } from './review-signoffs'

/**
 * The "fresh eyes" rule that gates the QA stage. A user may act as a QA reviewer on a translation
 * only if they are **neither the author nor someone who already acted as a corrector** on it — i.e.
 * not present in that PR's corrector approvals or change-requests. This is computed from the PR's
 * own sign-off lists, not from any stored role (see docs/adr/0001-two-stage-translation-review.md),
 * which keeps the codebase's identity-based, permissionless trust model while still guaranteeing QA
 * is a genuinely independent set of reviewers.
 *
 * The server enforces this on every QA action; the desktop hides/disables the actions client-side.
 */
export const isEligibleQaReviewer = (
  pullRequest: { author: string; body: string | null | undefined },
  login: string
): boolean => {
  if (login === pullRequest.author) return false
  if (ReviewSignoffs.approvals(pullRequest.body).includes(login)) return false
  if (ReviewSignoffs.changeRequests(pullRequest.body).includes(login)) return false
  return true
}
