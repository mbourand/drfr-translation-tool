import { ProgressionService } from './progression.service'

describe('ProgressionService', () => {
  const service = new ProgressionService()

  it('returns the curated progression value (no side effects)', () => {
    expect(service.getProgression()).toEqual({
      chapter3: { bible: 100, texts: 100, textures: 100, audio: 100, test: 100 },
      chapter4: { bible: 100, texts: 100, textures: 100, audio: 90, test: 97 }
    })
  })

  it('returns a stable value across calls', () => {
    expect(service.getProgression()).toEqual(service.getProgression())
  })
})
