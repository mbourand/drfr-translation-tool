import { translationFiles, findBetaFilePair, TRANSLATION_FILES } from './translation-files'

describe('translation files catalog', () => {
  it('exposes every catalog entry through all()', () => {
    expect(translationFiles.all()).toBe(TRANSLATION_FILES)
    expect(TRANSLATION_FILES.length).toBeGreaterThan(0)
    for (const file of TRANSLATION_FILES) {
      expect(file.original).toBeTruthy()
      expect(file.translated).toBeTruthy()
      expect(file.name).toBeTruthy()
      expect(file.category).toBeTruthy()
      expect(file.pathInGameFolder).toBeTruthy()
    }
  })

  it('derives the Beta QA pairs (translated = public filePath, original recoverable) from the same list', () => {
    const pairs = translationFiles.pairs()
    expect(pairs).toHaveLength(TRANSLATION_FILES.length)
    expect(pairs).toEqual(TRANSLATION_FILES.map((f) => ({ filePath: f.translated, originalPath: f.original })))
  })

  it('recovers the original (VO) path for a translated (VF) path via originalFor()', () => {
    const sample = TRANSLATION_FILES[0]
    expect(translationFiles.originalFor(sample.translated)).toBe(sample.original)
  })

  it('returns undefined from originalFor() for an unknown file', () => {
    expect(translationFiles.originalFor('chapitre-9/nope.txt')).toBeUndefined()
  })

  it('findBetaFilePair returns the pair for a known VF path and undefined otherwise', () => {
    const sample = TRANSLATION_FILES[0]
    expect(findBetaFilePair(sample.translated)).toEqual({
      filePath: sample.translated,
      originalPath: sample.original
    })
    expect(findBetaFilePair('chapitre-9/nope.txt')).toBeUndefined()
    // the original (VO) path is not itself a valid public key
    expect(findBetaFilePair(sample.original)).toBeUndefined()
  })
})
