import { computeTextsPercentage, isTechnicalString } from './texts-progression'

describe('isTechnicalString', () => {
  it.each([
    ['', 'blank'],
    ['   ', 'whitespace only'],
    ['obj_player_create', 'object identifier'],
    ['scr_dialogue_start', 'script identifier'],
    ['gml_Object_obj_thing', 'gml identifier'],
    ['DEVICE_KEYBOARD', 'device constant'],
    ['hello', 'bare lowercase word'],
    ['some_snake_case_token', 'snake_case token'],
    ['camelCaseToken', 'camelCase token']
  ])('treats %j (%s) as technical', (line) => {
    expect(isTechnicalString(line)).toBe(true)
  })

  it.each([
    ['Kris, are you there? Wake up.'],
    ['* You feel your sins crawling on your back.'],
    ['The shadow of a giant hand looms over the town.']
  ])('treats real dialogue %j as translatable prose', (line) => {
    expect(isTechnicalString(line)).toBe(false)
  })
})

describe('computeTextsPercentage', () => {
  it('returns 0 when nothing is translatable (only blank/technical/short lines)', () => {
    const text = ['', 'obj_thing', 'short', 'DEVICE_X'].join('\n')
    expect(computeTextsPercentage(text, text)).toBe(0)
  })

  it('returns 0 when a freshly-extracted file still equals its original', () => {
    const original = ['This is a translatable line of dialogue.', 'Another full sentence to translate here.'].join('\n')
    expect(computeTextsPercentage(original, original)).toBe(0)
  })

  it('returns 100 when every translatable line differs from the original', () => {
    const original = ['This is a translatable line of dialogue.', 'Another full sentence to translate here.'].join('\n')
    const translated = ['Ceci est une ligne de dialogue traduisible.', 'Une autre phrase complète à traduire ici.'].join('\n')
    expect(computeTextsPercentage(original, translated)).toBe(100)
  })

  it('counts only translatable lines, ignoring blanks, short and technical lines', () => {
    const original = [
      'This is a translatable line of dialogue.', // translatable, translated
      'Another full sentence to translate here.', // translatable, NOT translated
      'obj_player', // technical, ignored
      'short', // too short, ignored
      '' // blank, ignored
    ].join('\n')
    const translated = [
      'Ceci est une ligne de dialogue traduisible.',
      'Another full sentence to translate here.',
      'obj_player',
      'short',
      ''
    ].join('\n')
    // 1 of 2 translatable lines translated → 50%
    expect(computeTextsPercentage(original, translated)).toBe(50)
  })

  it('ignores carriage returns so CRLF vs LF does not read as untranslated', () => {
    const original = 'This is a translatable line of dialogue.\r\nAnother full sentence to translate here.'
    const translated = 'Ceci est une ligne de dialogue traduisible.\nUne autre phrase complète à traduire ici.'
    expect(computeTextsPercentage(original, translated)).toBe(100)
  })

  it('subtracts the auto-translated line count from both the translated and total counts', () => {
    const original = [
      'This first line is translatable dialogue.',
      'This second line is translatable dialogue.',
      'This third line is translatable dialogue.'
    ].join('\n')
    // All three differ from the original → 3 translated of 3 translatable.
    const translated = [
      'Première ligne de dialogue traduisible ici.',
      'Deuxième ligne de dialogue traduisible ici.',
      'Troisième ligne de dialogue traduisible ici.'
    ].join('\n')

    // Without subtraction: 3 / 3 → 100%.
    expect(computeTextsPercentage(original, translated)).toBe(100)
    // 1 auto-translated line drops out of both sides → (3 - 1) / (3 - 1) → 100%.
    expect(computeTextsPercentage(original, translated, 1)).toBe(100)
  })

  it('counts auto-translated lines against neither side when other lines are untranslated', () => {
    const original = [
      'This first line is translatable dialogue.', // translated
      'This second line is translatable dialogue.', // NOT translated
      'This third line is translatable dialogue.' // NOT translated
    ].join('\n')
    const translated = [
      'Première ligne de dialogue traduisible ici.',
      'This second line is translatable dialogue.',
      'This third line is translatable dialogue.'
    ].join('\n')

    // Raw: 1 of 3 → 33%. Treating 1 line as auto-translated: (1 - 1) / (3 - 1) → 0 / 2 → 0%.
    expect(computeTextsPercentage(original, translated, 1)).toBe(0)
  })

  it('returns 0 when the auto-translated count cancels out every translatable line', () => {
    const original = ['This first line is translatable dialogue.', 'This second line is translatable dialogue.'].join('\n')
    const translated = ['Première ligne de dialogue traduisible ici.', 'Deuxième ligne de dialogue traduisible ici.'].join(
      '\n'
    )
    // 2 translatable lines, 2 declared auto-translated → total is 0 → guard returns 0.
    expect(computeTextsPercentage(original, translated, 2)).toBe(0)
  })

  it('rounds to the nearest whole percent', () => {
    // 1 of 3 translatable lines translated → 33.33% → 33
    const original = [
      'This is a translatable line of dialogue.',
      'Another full sentence to translate here.',
      'A third translatable sentence of text.'
    ].join('\n')
    const translated = [
      'Ceci est une ligne de dialogue traduisible.',
      'Another full sentence to translate here.',
      'A third translatable sentence of text.'
    ].join('\n')
    expect(computeTextsPercentage(original, translated)).toBe(33)
  })
})
