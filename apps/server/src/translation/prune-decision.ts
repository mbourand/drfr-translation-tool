/** A storage directory holds one PR's screenshots under the prefix `pr-<pullRequestNumber>`. */
const PR_DIR_PATTERN = /^pr-(\d+)$/

/**
 * The destructive decision of the screenshot prune, isolated as a pure function so the rule that
 * decides *what gets deleted* is tested without touching the filesystem or GitHub (test seam 2).
 *
 * Given the set of currently-open PR numbers and the directory names present under the storage root,
 * return the directories to delete: every `pr-<n>` directory whose `n` is not open. This single rule
 * sweeps merged PRs, closed-by-any-means PRs, and orphaned uploads alike. Names that don't match the
 * `pr-<n>` scheme are never selected — the prune only owns the directories it creates.
 *
 * `openPrNumbers === null` is the **abort signal**: when the caller could not obtain an authoritative
 * list of open PRs, nothing is selected, so a transient GitHub failure can never wipe valid screenshots.
 * An empty set, by contrast, is authoritative ("no PRs are open") and selects every directory.
 */
export function selectPrunableDirs(openPrNumbers: ReadonlySet<number> | null, existingPrDirs: string[]): string[] {
  if (openPrNumbers === null) return []

  return existingPrDirs.filter((dir) => {
    const match = PR_DIR_PATTERN.exec(dir)
    if (!match) return false
    return !openPrNumbers.has(Number(match[1]))
  })
}
