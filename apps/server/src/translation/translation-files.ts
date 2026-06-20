/**
 * The single catalog of translation files for the project. Every other view of "which files
 * exist" — the Review tab's list and the Beta QA pairs — derives from this one array, so adding a
 * chapter is a one-line change here instead of two lists that drift.
 *
 * Each entry pairs the original (VO) repo path with the translated (VF) repo path, plus display
 * metadata (name, category) and where the translated file lives inside an extracted game folder.
 */
export type TranslationFile = {
  original: string
  translated: string
  name: string
  category: string
  pathsInGameFolder: { windows: string }
}

export const TRANSLATION_FILES: TranslationFile[] = [
  {
    original: 'chapitre-0/strings_en.txt',
    translated: 'chapitre-0/strings_fr.txt',
    name: 'Strings du chapitre 0',
    category: 'Chapitre 0',
    pathsInGameFolder: {
      windows: 'data.win'
    }
  },
  {
    original: 'chapitre-1/lang_en.json',
    translated: 'chapitre-1/lang_fr.json',
    name: 'Dialogues du chapitre 1',
    category: 'Chapitre 1',
    pathsInGameFolder: {
      windows: 'chapter1_windows/lang/lang_en.json'
    }
  },
  {
    original: 'chapitre-1/strings_en.txt',
    translated: 'chapitre-1/strings_fr.txt',
    name: 'Strings du chapitre 1',
    category: 'Chapitre 1',
    pathsInGameFolder: {
      windows: 'chapter1_windows/data.win'
    }
  },
  {
    original: 'chapitre-2/strings_en.txt',
    translated: 'chapitre-2/strings_fr.txt',
    name: 'Strings du chapitre 2',
    category: 'Chapitre 2',
    pathsInGameFolder: {
      windows: 'chapter2_windows/data.win'
    }
  },
  {
    original: 'chapitre-3/strings_en.txt',
    translated: 'chapitre-3/strings_fr.txt',
    name: 'Strings du chapitre 3',
    category: 'Chapitre 3',
    pathsInGameFolder: {
      windows: 'chapter3_windows/data.win'
    }
  },
  {
    original: 'chapitre-4/strings_en.txt',
    translated: 'chapitre-4/strings_fr.txt',
    name: 'Strings du chapitre 4',
    category: 'Chapitre 4',
    pathsInGameFolder: {
      windows: 'chapter4_windows/data.win'
    }
  }
]

/**
 * A Beta QA file pair: the public `filePath` is the translated (VF) path — the canonical key for a
 * file in the Beta QA grid — and `originalPath` is the matching original (VO) path used to
 * reconstruct each line's (VO, VF).
 */
export type BetaFilePair = { filePath: string; originalPath: string }

/**
 * The catalog read through its two adapters: `all()` for the Review tab (full entries) and
 * `pairs()` / `originalFor()` for Beta QA (the (VF → VO) mapping).
 */
export const translationFiles = {
  all: (): readonly TranslationFile[] => TRANSLATION_FILES,
  pairs: (): BetaFilePair[] => TRANSLATION_FILES.map((f) => ({ filePath: f.translated, originalPath: f.original })),
  originalFor: (filePath: string): string | undefined =>
    TRANSLATION_FILES.find((f) => f.translated === filePath)?.original
}

/**
 * The Beta QA pair for a public (VF) `filePath`, or `undefined` if it isn't a known translated file.
 * An original (VO) path is not a valid key, so it returns `undefined` too.
 */
export const findBetaFilePair = (filePath: string): BetaFilePair | undefined => {
  const originalPath = translationFiles.originalFor(filePath)
  return originalPath ? { filePath, originalPath } : undefined
}
