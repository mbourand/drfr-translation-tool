const MIN_TRANSLATABLE_LENGTH = 20

export const isTechnicalString = (line: string): boolean =>
  line.trim() === '' ||
  line.startsWith('obj_') ||
  line.startsWith('scr_') ||
  line.startsWith('gml_') ||
  line.startsWith('DEVICE_') ||
  /^[a-z]+$/.test(line) ||
  /^[A-Za-z]*_[a-zA-Z0-9_]*$/.test(line) ||
  /^[a-z]+[A-Z0-9][a-zA-Z0-9]*$/.test(line)

const splitLines = (text: string): string[] => text.replaceAll('\r', '').split('\n')

const isTranslatable = (line: string): boolean => line.length >= MIN_TRANSLATABLE_LENGTH && !isTechnicalString(line)

export type TextsBreakdown = {
  /** Translated lines counted before removing the automatically translated ones. */
  translated: number
  /** Total translatable lines before removing the automatically translated ones. */
  translatable: number
  /** Number of lines that were automatically translated. */
  autoTranslatedLines: number
  /** Translated lines after subtracting the automatically translated ones. */
  relevantTranslated: number
  /** Total translatable lines after subtracting the automatically translated ones. */
  relevantTotal: number
  /** Final progression percentage. */
  percent: number
}

export const computeTextsBreakdown = (
  originalText: string,
  translatedText: string,
  autoTranslatedLines = 0
): TextsBreakdown => {
  const originalLines = splitLines(originalText)
  const translatedLines = splitLines(translatedText)

  let translated = 0
  let translatable = 0

  for (let i = 0; i < originalLines.length; i++) {
    const originalLine = originalLines[i]
    if (!isTranslatable(originalLine)) continue

    translatable++
    if (originalLine !== translatedLines[i]) translated++
  }

  const relevantTranslated = translated - autoTranslatedLines
  const relevantTotal = translatable - autoTranslatedLines
  const percent = relevantTotal <= 0 ? 0 : Math.round((relevantTranslated / relevantTotal) * 100)

  return { translated, translatable, autoTranslatedLines, relevantTranslated, relevantTotal, percent }
}

export const computeTextsPercentage = (originalText: string, translatedText: string, autoTranslatedLines = 0): number =>
  computeTextsBreakdown(originalText, translatedText, autoTranslatedLines).percent
