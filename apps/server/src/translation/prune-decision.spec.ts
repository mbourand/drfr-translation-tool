import { selectPrunableDirs } from './prune-decision'

describe('selectPrunableDirs (screenshot prune decision)', () => {
  it('selects directories whose PR is not in the open set', () => {
    const open = new Set([1, 2])
    expect(selectPrunableDirs(open, ['pr-1', 'pr-3', 'pr-7'])).toEqual(['pr-3', 'pr-7'])
  })

  it('keeps directories for open PRs', () => {
    const open = new Set([1, 2, 3])
    expect(selectPrunableDirs(open, ['pr-1', 'pr-2', 'pr-3'])).toEqual([])
  })

  it('selects everything when no PR is open (authoritative empty list)', () => {
    expect(selectPrunableDirs(new Set(), ['pr-4', 'pr-5'])).toEqual(['pr-4', 'pr-5'])
  })

  it('selects nothing when the open-PR input is the abort signal (null)', () => {
    expect(selectPrunableDirs(null, ['pr-4', 'pr-5'])).toEqual([])
  })

  it('ignores directory names that are not the `pr-<n>` scheme', () => {
    const open = new Set([1])
    expect(selectPrunableDirs(open, ['pr-1', 'pr-2', 'tmp', 'pr-x', '.keep'])).toEqual(['pr-2'])
  })

  it('returns nothing for an empty storage root', () => {
    expect(selectPrunableDirs(new Set([1]), [])).toEqual([])
  })
})
