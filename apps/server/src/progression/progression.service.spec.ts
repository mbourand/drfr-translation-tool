import { ProgressionService } from './progression.service'

describe('ProgressionService', () => {
  it('returns the curated progression value when no texts overlay has been computed yet', () => {
    expect(new ProgressionService().getProgression()).toEqual({
      chapter3: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
      chapter4: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
      chapter5: { bible: 0, texts: 0, textures: 0, audio: 0, test: 0 }
    })
  })

  it('returns a stable value across calls (no side effects)', () => {
    const service = new ProgressionService()
    expect(service.getProgression()).toEqual(service.getProgression())
  })

  it('tracks only chapter 5', () => {
    expect(new ProgressionService().trackedChapters()).toEqual(['chapter5'])
  })

  it('overlays the computed texts onto chapter 5 and derives test as half of it, leaving other chapters at 100', () => {
    const service = new ProgressionService()
    service.setTextsProgression('chapter5', 42)

    const progression = service.getProgression()
    expect(progression.chapter5).toEqual({ bible: 0, texts: 42, textures: 0, audio: 0, test: 21 })
    // Finished chapters keep their curated 100 everywhere — the overlay never touches them.
    expect(progression.chapter3).toEqual({ bible: 100, texts: 100, textures: 100, audio: 100, test: 100 })
    expect(progression.chapter4).toEqual({ bible: 100, texts: 100, textures: 100, audio: 100, test: 100 })
  })

  it('uses the latest overlay value when texts is recomputed', () => {
    const service = new ProgressionService()
    service.setTextsProgression('chapter5', 10)
    service.setTextsProgression('chapter5', 76)
    expect(service.getProgression().chapter5).toMatchObject({ texts: 76, test: 38 })
  })
})
