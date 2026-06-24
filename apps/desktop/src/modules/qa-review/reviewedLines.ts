import { store, STORE_KEYS } from '../../store/store'

/**
 * Local, per-machine record of which changed lines a QA has marked "already read" in the review grid,
 * keyed by branch → translated file path → list of content hashes (`hashBetaLine` of (VO, VF)).
 *
 * This is a personal scratchpad: never synced to the server, no effect on the review workflow or the
 * approval flow. Marks are content-anchored (keyed by the line's text hash), so editing a line changes
 * its hash and its mark naturally drops — the line is genuinely unreviewed again. Branch-scoped, so the
 * same text in another translation starts fresh.
 */
export type ReviewedLinesStore = Record<string, Record<string, string[]>>

const readAll = async (): Promise<ReviewedLinesStore> =>
  (await store.get<ReviewedLinesStore>(STORE_KEYS.QA_REVIEWED_LINES)) ?? {}

const writeAll = async (next: ReviewedLinesStore): Promise<void> => {
  await store.set(STORE_KEYS.QA_REVIEWED_LINES, next)
  await store.save()
}

/** The reviewed-line hashes for one branch, grouped by file path (empty object if none). */
export const getReviewedLinesForBranch = async (branch: string): Promise<Record<string, string[]>> =>
  (await readAll())[branch] ?? {}

/** Flip the reviewed state of one line (by its content hash) in one file of one branch. */
export const toggleReviewedLine = async (branch: string, filePath: string, hash: string): Promise<void> => {
  const all = await readAll()
  const branchMarks = all[branch] ?? {}
  const fileHashes = new Set(branchMarks[filePath] ?? [])

  if (fileHashes.has(hash)) fileHashes.delete(hash)
  else fileHashes.add(hash)

  const nextBranch = { ...branchMarks }
  if (fileHashes.size === 0) delete nextBranch[filePath]
  else nextBranch[filePath] = [...fileHashes]

  const next = { ...all }
  if (Object.keys(nextBranch).length === 0) delete next[branch]
  else next[branch] = nextBranch

  await writeAll(next)
}

/** Drop marks for any branch that is no longer an open translation (prune-on-read). */
export const pruneReviewedLines = async (openBranches: string[]): Promise<void> => {
  const all = await readAll()
  const keep = new Set(openBranches)

  const next: ReviewedLinesStore = {}
  let changed = false
  for (const [branch, marks] of Object.entries(all)) {
    if (keep.has(branch)) next[branch] = marks
    else changed = true
  }

  if (changed) await writeAll(next)
}
