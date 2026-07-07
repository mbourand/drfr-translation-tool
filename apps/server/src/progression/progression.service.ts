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
  chapter5: ChapterProgression
}

export type ChapterKey = keyof Progression

const CURATED: Progression = {
  chapter3: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
  chapter4: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
  chapter5: { bible: 90, texts: 0, textures: 0, audio: 0, test: 0 }
}

const TRACKED_CHAPTERS: ChapterKey[] = ['chapter5']

@Injectable()
export class ProgressionService {
  private readonly textsOverlay = new Map<ChapterKey, number>()

  getProgression(): Progression {
    return Object.fromEntries(
      (Object.entries(CURATED) as [ChapterKey, ChapterProgression][]).map(([chapter, value]) => {
        const computedTexts = this.textsOverlay.get(chapter)
        if (computedTexts === undefined) return [chapter, value]
        return [chapter, { ...value, texts: computedTexts, test: computedTexts / 2 }]
      })
    ) as Progression
  }

  trackedChapters(): ChapterKey[] {
    return TRACKED_CHAPTERS
  }

  setTextsProgression(chapter: ChapterKey, percent: number): void {
    this.textsOverlay.set(chapter, percent)
  }
}
