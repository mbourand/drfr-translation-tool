export const makeLineKey = (translatedPath: string, line: number) => `${translatedPath}:${line}`

export const parseLineKey = (key: string): { translatedPath: string; lineNumber: number } | null => {
  const separatorIndex = key.lastIndexOf(':')
  if (separatorIndex === -1) return null
  const lineNumber = parseInt(key.slice(separatorIndex + 1), 10)
  if (Number.isNaN(lineNumber)) return null
  return { translatedPath: key.slice(0, separatorIndex), lineNumber }
}
