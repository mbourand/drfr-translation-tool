/**
 * A reviewable Beta QA file is a pair of repo files: the original (VO) and the translated (VF).
 * The public `filePath` used by the API is the translated (VF) path — the canonical key for a
 * file in the Beta QA grid. Given that key we can recover the matching original path to
 * reconstruct each line's (VO, VF) when reading counts.
 *
 * Mirrors the Review tab's file list (`translation.controller`). Kept here so the Beta QA read
 * path is self-contained; if these drift, extract a single shared list.
 */
export type BetaFilePair = { filePath: string; originalPath: string }

export const BETA_FILE_PAIRS: BetaFilePair[] = [
  { filePath: 'chapitre-0/strings_fr.txt', originalPath: 'chapitre-0/strings_en.txt' },
  { filePath: 'chapitre-1/lang_fr.json', originalPath: 'chapitre-1/lang_en.json' },
  { filePath: 'chapitre-1/strings_fr.txt', originalPath: 'chapitre-1/strings_en.txt' },
  { filePath: 'chapitre-2/strings_fr.txt', originalPath: 'chapitre-2/strings_en.txt' },
  { filePath: 'chapitre-3/strings_fr.txt', originalPath: 'chapitre-3/strings_en.txt' },
  { filePath: 'chapitre-4/strings_fr.txt', originalPath: 'chapitre-4/strings_en.txt' }
]

export const findBetaFilePair = (filePath: string): BetaFilePair | undefined =>
  BETA_FILE_PAIRS.find((pair) => pair.filePath === filePath)
