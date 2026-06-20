import { ReviewSignoffs } from './review-signoffs'

const INITIAL = '[APPROVED_BY][][/APPROVED_BY]\n[REQUESTED_CHANGES][][/REQUESTED_CHANGES]'

describe('ReviewSignoffs', () => {
  it('initialBody() is the empty approvals + change-requests scaffold', () => {
    expect(ReviewSignoffs.initialBody()).toBe(INITIAL)
    expect(ReviewSignoffs.approvals(ReviewSignoffs.initialBody())).toEqual([])
    expect(ReviewSignoffs.changeRequests(ReviewSignoffs.initialBody())).toEqual([])
  })

  it('approve() records the reviewer under approvals', () => {
    const body = ReviewSignoffs.approve(INITIAL, 'alice')
    expect(ReviewSignoffs.approvals(body)).toEqual(['alice'])
    expect(ReviewSignoffs.changeRequests(body)).toEqual([])
  })

  it('requestChanges() records the reviewer under change-requests', () => {
    const body = ReviewSignoffs.requestChanges(INITIAL, 'bob')
    expect(ReviewSignoffs.changeRequests(body)).toEqual(['bob'])
    expect(ReviewSignoffs.approvals(body)).toEqual([])
  })

  it('a reviewer is only ever in one list: approving then requesting changes moves them', () => {
    let body = ReviewSignoffs.approve(INITIAL, 'alice')
    body = ReviewSignoffs.requestChanges(body, 'alice')
    expect(ReviewSignoffs.approvals(body)).toEqual([])
    expect(ReviewSignoffs.changeRequests(body)).toEqual(['alice'])
  })

  it('approving twice does not duplicate the reviewer', () => {
    let body = ReviewSignoffs.approve(INITIAL, 'alice')
    body = ReviewSignoffs.approve(body, 'alice')
    expect(ReviewSignoffs.approvals(body)).toEqual(['alice'])
  })

  it('records multiple distinct approvers', () => {
    let body = ReviewSignoffs.approve(INITIAL, 'alice')
    body = ReviewSignoffs.approve(body, 'bob')
    expect(ReviewSignoffs.approvals(body)).toEqual(['alice', 'bob'])
  })

  it('clearChangeRequests() empties the change-requests but leaves approvals', () => {
    let body = ReviewSignoffs.approve(INITIAL, 'alice')
    body = ReviewSignoffs.requestChanges(body, 'bob')
    body = ReviewSignoffs.clearChangeRequests(body)
    expect(ReviewSignoffs.changeRequests(body)).toEqual([])
    expect(ReviewSignoffs.approvals(body)).toEqual(['alice'])
  })

  it('reads empty lists from a missing/empty body', () => {
    expect(ReviewSignoffs.approvals(null)).toEqual([])
    expect(ReviewSignoffs.changeRequests(undefined)).toEqual([])
    expect(ReviewSignoffs.approvals('no markers here')).toEqual([])
  })

  it('prepends a section when the body has none (legacy PR bodies)', () => {
    const body = ReviewSignoffs.approve('some freeform description', 'alice')
    expect(ReviewSignoffs.approvals(body)).toEqual(['alice'])
    expect(body).toContain('some freeform description')
  })
})
