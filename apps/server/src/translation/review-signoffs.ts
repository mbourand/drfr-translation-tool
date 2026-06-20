import z from 'zod'

/**
 * The review sign-off state of a translation PR, encoded as two marker sections inside the PR body:
 *
 *   [APPROVED_BY]["alice","bob"][/APPROVED_BY]
 *   [REQUESTED_CHANGES]["carol"][/REQUESTED_CHANGES]
 *
 * Each section holds a JSON array of GitHub logins. This module is the one place that knows that
 * format: how to read the two lists, how to record an approval or a change-request (a reviewer is
 * only ever in one of the two), and how to reset them. Encode/decode used to be four free functions
 * smeared across the controller; folding them here makes the format local and unit-testable.
 */

const APPROVED_BY_PREFIX = '[APPROVED_BY]'
const APPROVED_BY_SUFFIX = '[/APPROVED_BY]'
const REQUESTED_CHANGES_PREFIX = '[REQUESTED_CHANGES]'
const REQUESTED_CHANGES_SUFFIX = '[/REQUESTED_CHANGES]'

type SignoffKind = 'approvals' | 'change_requested'

const markersFor = (kind: SignoffKind) =>
  kind === 'approvals'
    ? { prefix: APPROVED_BY_PREFIX, suffix: APPROVED_BY_SUFFIX }
    : { prefix: REQUESTED_CHANGES_PREFIX, suffix: REQUESTED_CHANGES_SUFFIX }

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
  /** The marker scaffold a new translation PR body starts with: empty approvals and change-requests. */
  initialBody: (): string =>
    `${APPROVED_BY_PREFIX}[]${APPROVED_BY_SUFFIX}\n${REQUESTED_CHANGES_PREFIX}[]${REQUESTED_CHANGES_SUFFIX}`,

  /** The logins that have approved. */
  approvals: (body: string | null | undefined): string[] => read('approvals', body),

  /** The logins that have requested changes. */
  changeRequests: (body: string | null | undefined): string[] => read('change_requested', body),

  /** Record `reviewer`'s approval: add them to approvals and drop any change-request they had. */
  approve: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('change_requested', addReviewer('approvals', body, reviewer), reviewer),

  /** Record `reviewer` requesting changes: add them to change-requests and drop any approval they had. */
  requestChanges: (body: string | null | undefined, reviewer: string): string =>
    removeReviewer('approvals', addReviewer('change_requested', body, reviewer), reviewer),

  /** Reset the change-requests to empty (used when a branch is (re)submitted for review). */
  clearChangeRequests: (body: string | null | undefined): string => clearReviewers('change_requested', body)
}
