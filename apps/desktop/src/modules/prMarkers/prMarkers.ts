import { z } from 'zod'

export const readMarker = <T extends z.ZodType>(
  body: string | null | undefined,
  name: string,
  schema: T
): z.infer<T> | null => {
  if (!body) return null

  const prefix = `[${name}]`
  const suffix = `[/${name}]`

  const startIndex = body.indexOf(prefix)
  const endIndex = body.indexOf(suffix)
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return null

  const raw = body.slice(startIndex + prefix.length, endIndex)

  try {
    return schema.parse(JSON.parse(raw || 'null'))
  } catch (e) {
    console.warn(`Failed to parse marker [${name}] in PR body:`, e)
    return null
  }
}

export const writeMarker = (body: string, name: string, value: unknown): string => {
  const prefix = `[${name}]`
  const suffix = `[/${name}]`
  const block = `${prefix}${JSON.stringify(value)}${suffix}`

  const startIndex = body.indexOf(prefix)
  const endIndex = body.indexOf(suffix)
  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    return body.slice(0, startIndex) + block + body.slice(endIndex + suffix.length)
  }

  return body ? `${body}\n\n${block}` : block
}
