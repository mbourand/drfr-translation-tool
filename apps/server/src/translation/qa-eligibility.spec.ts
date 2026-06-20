import { isEligibleQaReviewer } from './qa-eligibility'
import { ReviewSignoffs } from './review-signoffs'

describe('isEligibleQaReviewer (fresh-eyes rule)', () => {
  const author = 'author'

  it('rejects the author of the translation', () => {
    expect(isEligibleQaReviewer({ author, body: ReviewSignoffs.initialBody() }, author)).toBe(false)
  })

  it('rejects a login present in the corrector approvals', () => {
    const body = ReviewSignoffs.approve(ReviewSignoffs.initialBody(), 'corrector')
    expect(isEligibleQaReviewer({ author, body }, 'corrector')).toBe(false)
  })

  it('rejects a login present in the corrector change-requests', () => {
    const body = ReviewSignoffs.requestChanges(ReviewSignoffs.initialBody(), 'corrector')
    expect(isEligibleQaReviewer({ author, body }, 'corrector')).toBe(false)
  })

  it('accepts an unrelated login (neither author nor corrector)', () => {
    let body = ReviewSignoffs.approve(ReviewSignoffs.initialBody(), 'corrector1')
    body = ReviewSignoffs.approve(body, 'corrector2')
    expect(isEligibleQaReviewer({ author, body }, 'fresh')).toBe(true)
  })

  it('still rejects the author even after fresh eyes have QA-approved', () => {
    const body = ReviewSignoffs.qaApprove(ReviewSignoffs.initialBody(), 'fresh')
    expect(isEligibleQaReviewer({ author, body }, author)).toBe(false)
  })

  it('does not treat a QA reviewer as a corrector: a prior QA approver stays eligible', () => {
    const body = ReviewSignoffs.qaApprove(ReviewSignoffs.initialBody(), 'fresh')
    expect(isEligibleQaReviewer({ author, body }, 'fresh')).toBe(true)
  })
})
