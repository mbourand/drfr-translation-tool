import z from 'zod'

/**
 * The review sign-off state of a translation PR, encoded as four marker sections inside the PR body
 * — two for the correction stage, two for the QA stage:
 *
 *   [APPROVED_BY]["alice","bob"][/APPROVED_BY]
 *   [REQUESTED_CHANGES]["carol"][/REQUESTED_CHANGES]
 *   [QA_APPROVED_BY]["dave"][/QA_APPROVED_BY]
 *   [QA_REQUESTED_CHANGES][][/QA_REQUESTED_CHANGES]
 *
 * Each section holds a JSON array of GitHub logins. This module is the one place that knows that
 * format: how to read the four lists, how to record an approval or a change-request (a reviewer is
 * only ever in one of the two lists *within a stage*), and how to reset them. The QA lists are kept
 * separate from the corrector ones so a QA change-request never disturbs the corrector approvals
 * (see docs/adr/0001-two-stage-translation-review.md). Reading tolerates legacy bodies that predate
 * the QA sections: a missing section reads as an empty list.
 */

const APPROVED_BY_PREFIX = '[APPROVED_BY]'
const APPROVED_BY_SUFFIX = '[/APPROVED_BY]'
const REQUESTED_CHANGES_PREFIX = '[REQUESTED_CHANGES]'
const REQUESTED_CHANGES_SUFFIX = '[/REQUESTED_CHANGES]'
const QA_APPROVED_BY_PREFIX = '[QA_APPROVED_BY]'
const QA_APPROVED_BY_SUFFIX = '[/QA_APPROVED_BY]'
const QA_REQUESTED_CHANGES_PREFIX = '[QA_REQUESTED_CHANGES]'
const QA_REQUESTED_CHANGES_SUFFIX = '[/QA_REQUESTED_CHANGES]'

type SignoffKind = 'approvals' | 'change_requested' | 'qa_approvals' | 'qa_change_requested'

const MARKERS: Record<SignoffKind, { prefix: string; suffix: string }> = {
  approvals: { prefix: APPROVED_BY_PREFIX, suffix: APPROVED_BY_SUFFIX },
  change_requested: { prefix: REQUESTED_CHANGES_PREFIX, suffix: REQUESTED_CHANGES_SUFFIX },
  qa_approvals: { prefix: QA_APPROVED_BY_PREFIX, suffix: QA_APPROVED_BY_SUFFIX },
  qa_change_requested: { prefix: QA_REQUESTED_CHANGES_PREFIX, suffix: QA_REQUESTED_CHANGES_SUFFIX }
}

const markersFor = (kind: SignoffKind) => MARKERS[kind]

function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

const read = (kind: SignoffKind, body: string | null | undefined): string[] => {
  if (!body) return []

  const { prefix, suffix } = markersFor(kind)
  const startIndex = body.indexOf(prefix)
  const endIndex = body.indexOf(suffix)
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return []

  const reviewStr = body.slice(startIndex + prefix.length, endIndex)

  try {
    return z.array(z.string()).parse(JSON.parse(reviewStr || '[]'))
  } catch (e) {
    console.log(e)
    return []
  }
}

const addReviewer = (kind: SignoffKind, bodyParam: string | null | undefined, reviewer: string): string => {
  const body = bodyParam || ''
  const { prefix, suffix } = markersFor(kind)

  const startIndex = body.indexOf(prefix)
  const endIndex = body.indexOf(suffix)

  if (startIndex === -1 || endIndex === -1) {
    return `${prefix}${JSON.stringify([reviewer])}${suffix}\n` + body
  }

  if (startIndex >= endIndex) {
    throw new Error(`Invalid body format: pull request contains an invalid ${kind} section`)
  }

  const reviews = read(kind, body)
  if (!reviews.includes(reviewer)) {
    reviews.push(reviewer)
  }

  return body.replace(
    new RegExp(`${escapeRegExp(prefix)}.*?${escapeRegExp(suffix)}`),
    `${prefix}${JSON.stringify(reviews)}${suffix}`
  )
}

const removeReviewer = (kind: SignoffKind, bodyParam: string | null | undefined, reviewer: string): string => {
  const body = bodyParam || ''
  const { prefix, suffix } = markersFor(kind)

  const startIndex = body.indexOf(prefix)
  const endIndex = body.indexOf(suffix)

  if (startIndex === -1 || endIndex === -1) {
    return body
  }

  if (startIndex >= endIndex) {
    throw new Error(`Invalid body format: pull request contains an invalid ${kind} section`)
  }

  const reviews = read(kind, body).filter((r) => r !== reviewer)

  return body.replace(
    new RegExp(`${escapeRegExp(prefix)}.*?${escapeRegExp(suffix)}`),
    `${prefix}${JSON.stringify(reviews)}${suffix}`
  )
}

const clearReviewers = (kind: SignoffKind, bodyParam: string | null | undefined): string => {
  const body = bodyParam || ''
  const { prefix, suffix } = markersFor(kind)
  return body.replace(new RegExp(`${escapeRegExp(prefix)}.*?${escapeRegExp(suffix)}`), `${prefix}[]${suffix}`)
}

export const ReviewSignoffs = {
  /** The marker scaffold a new translation PR body starts with: all four sign-off lists empty. */
  initialBody: (): string =>
    [
      `${APPROVED_BY_PREFIX}[]${APPROVED_BY_SUFFIX}`,
      `${REQUESTED_CHANGES_PREFIX}[]${REQUESTED_CHANGES_SUFFIX}`,
      `${QA_APPROVED_BY_PREFIX}[]${QA_APPROVED_BY_SUFFIX}`,
      `${QA_REQUESTED_CHANGES_PREFIX}[]${QA_REQUESTED_CHANGES_SUFFIX}`
    ].join('\n'),

  /** The logins that have approved during correction. */
  approvals: (body: string | null | undefined): string[] => read('approvals', body),

  /** The logins that have requested changes during correction. */
  changeRequests: (body: string | null | undefined): string[] => read('change_requested', body),

  /** The logins that have approved during QA. */
  qaApprovals: (body: string | null | undefined): string[] => read('qa_approvals', body),

  /** The logins that have requested changes during QA. */
  qaChangeRequests: (body: string | null | undefined): string[] => read('qa_change_requested', body),

  /** Record `reviewer`'s approval: add them to approvals and drop any change-request they had. */
  approve: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('change_requested', addReviewer('approvals', body, reviewer), reviewer),

  /** Record `reviewer` requesting changes: add them to change-requests and drop any approval they had. */
  requestChanges: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('approvals', addReviewer('change_requested', body, reviewer), reviewer),

  /** Record `reviewer`'s QA approval: add them to QA approvals and drop any QA change-request they had. */
  qaApprove: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('qa_change_requested', addReviewer('qa_approvals', body, reviewer), reviewer),

  /** Record `reviewer` requesting QA changes: add them to QA change-requests and drop any QA approval. */
  qaRequestChanges: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('qa_approvals', addReviewer('qa_change_requested', body, reviewer), reviewer),

  /** Reset the corrector change-requests to empty (used when a branch is (re)submitted for review). */
  clearChangeRequests: (body: string | null | undefined): string => clearReviewers('change_requested', body),

  /** Reset the QA change-requests to empty (used when a branch is (re)submitted for review). */
  clearQaChangeRequests: (body: string | null | undefined): string => clearReviewers('qa_change_requested', body)
}
