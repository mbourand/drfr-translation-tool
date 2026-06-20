export type Line = {
  lineNumber: number
  original: string
  translated: string
  oldTranslated?: string
}

export type TranslationFile = {
  name: string
  category: string
  originalPath: string
  translatedPath: string
  lines: Line[]
  pathsInGameFolder: {
    windows: string
  }
  hasChanges?: boolean
}

export type MatchLanguages = 'fr' | 'en'
