import { Injectable } from '@nestjs/common'

export type ChapterProgression = {
  bible: number
  texts: number
  textures: number
  audio: number
  test: number
}

export type Progression = {
  chapter3: ChapterProgression
  chapter4: ChapterProgression
}

/**
 * Curated, manually-maintained translation progression shown on the public dashboard.
 *
 * These percentages are NOT derived from diffing the translation files. A text diff can only
 * estimate the `texts` dimension; the others (story bible, textures, audio, playtest) have no
 * machine-readable source and are tracked by hand. An earlier version downloaded files and
 * computed a `texts`-only number on every boot, then threw it away and returned these constants
 * anyway — the computation was dead and the boot-time network call polluted the test harness.
 */
const PROGRESSION: Progression = {
  chapter3: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
  chapter4: { bible: 100, texts: 100, textures: 100, audio: 90, test: 97 }
}

/**
 * Returns the progression value. No side effects, no network, no boot work — the result IS the
 * interface, so it can be asserted directly in a test.
 */
@Injectable()
export class ProgressionService {
  getProgression(): Progression {
    return PROGRESSION
  }
}
