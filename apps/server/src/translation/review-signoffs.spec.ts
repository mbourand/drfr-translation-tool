import { ReviewSignoffs } from './review-signoffs'

const INITIAL =
  '[APPROVED_BY][][/APPROVED_BY]\n[REQUESTED_CHANGES][][/REQUESTED_CHANGES]\n' +
  '[QA_APPROVED_BY][][/QA_APPROVED_BY]\n[QA_REQUESTED_CHANGES][][/QA_REQUESTED_CHANGES]'

// A body from before the QA sections existed: only the two corrector sections.
const LEGACY = '[APPROVED_BY]["alice"][/APPROVED_BY]\n[REQUESTED_CHANGES][][/REQUESTED_CHANGES]'

describe('ReviewSignoffs', () => {
  it('initialBody() seeds all four sign-off lists empty', () => {
    expect(ReviewSignoffs.initialBody()).toBe(INITIAL)
    expect(ReviewSignoffs.approvals(ReviewSignoffs.initialBody())).toEqual([])
    expect(ReviewSignoffs.changeRequests(ReviewSignoffs.initialBody())).toEqual([])
    expect(ReviewSignoffs.qaApprovals(ReviewSignoffs.initialBody())).toEqual([])
    expect(ReviewSignoffs.qaChangeRequests(ReviewSignoffs.initialBody())).toEqual([])
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

  describe('QA sign-offs', () => {
    it('qaApprove() records the reviewer under QA approvals, leaving corrector lists untouched', () => {
      const body = ReviewSignoffs.qaApprove(INITIAL, 'dave')
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual([])
      expect(ReviewSignoffs.approvals(body)).toEqual([])
      expect(ReviewSignoffs.changeRequests(body)).toEqual([])
    })

    it('qaRequestChanges() records the reviewer under QA change-requests', () => {
      const body = ReviewSignoffs.qaRequestChanges(INITIAL, 'dave')
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual(['dave'])
      expect(ReviewSignoffs.qaApprovals(body)).toEqual([])
    })

    it('a QA reviewer is only ever in one QA list: approving then requesting changes moves them', () => {
      let body = ReviewSignoffs.qaApprove(INITIAL, 'dave')
      body = ReviewSignoffs.qaRequestChanges(body, 'dave')
      expect(ReviewSignoffs.qaApprovals(body)).toEqual([])
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual(['dave'])
    })

    it('QA-approving twice does not duplicate the reviewer', () => {
      let body = ReviewSignoffs.qaApprove(INITIAL, 'dave')
      body = ReviewSignoffs.qaApprove(body, 'dave')
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
    })

    it('records multiple distinct QA approvers (two passes the gate)', () => {
      let body = ReviewSignoffs.qaApprove(INITIAL, 'dave')
      body = ReviewSignoffs.qaApprove(body, 'erin')
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave', 'erin'])
    })

    it('QA sign-offs are independent of corrector sign-offs', () => {
      let body = ReviewSignoffs.approve(INITIAL, 'alice')
      body = ReviewSignoffs.approve(body, 'bob')
      body = ReviewSignoffs.qaApprove(body, 'dave')
      expect(ReviewSignoffs.approvals(body)).toEqual(['alice', 'bob'])
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
    })

    it('reads QA lists as empty from a legacy body that lacks the QA sections', () => {
      expect(ReviewSignoffs.qaApprovals(LEGACY)).toEqual([])
      expect(ReviewSignoffs.qaChangeRequests(LEGACY)).toEqual([])
      // the corrector sections still read normally
      expect(ReviewSignoffs.approvals(LEGACY)).toEqual(['alice'])
    })

    it('qaApprove() on a legacy body adds the QA section without touching corrector approvals', () => {
      const body = ReviewSignoffs.qaApprove(LEGACY, 'dave')
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
      expect(ReviewSignoffs.approvals(body)).toEqual(['alice'])
    })

    it('clearQaChangeRequests() empties QA change-requests but leaves QA approvals and corrector lists', () => {
      let body = ReviewSignoffs.approve(INITIAL, 'alice')
      body = ReviewSignoffs.approve(body, 'bob')
      body = ReviewSignoffs.qaApprove(body, 'dave')
      body = ReviewSignoffs.qaRequestChanges(body, 'erin')

      body = ReviewSignoffs.clearQaChangeRequests(body)

      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual([])
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
      expect(ReviewSignoffs.approvals(body)).toEqual(['alice', 'bob'])
    })

    it('resubmit (clear both change-request lists) leaves both approval lists intact', () => {
      let body = ReviewSignoffs.approve(INITIAL, 'alice')
      body = ReviewSignoffs.approve(body, 'bob')
      body = ReviewSignoffs.qaApprove(body, 'dave')
      body = ReviewSignoffs.qaRequestChanges(body, 'erin')

      body = ReviewSignoffs.clearChangeRequests(ReviewSignoffs.clearQaChangeRequests(body))

      expect(ReviewSignoffs.changeRequests(body)).toEqual([])
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual([])
      expect(ReviewSignoffs.approvals(body)).toEqual(['alice', 'bob'])
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['dave'])
    })
  })
})
