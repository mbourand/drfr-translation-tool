import { StringSearchResult } from './StringSearch/types'
import { getParts } from '../string-search/get-parts'

type HighlightedTextProps = {
  text: string
  rowIndex: number
  searchResult: StringSearchResult | null
}

export const HighlightedText = ({ text, rowIndex, searchResult }: HighlightedTextProps) => {
  if (!searchResult) return <>{text}</>

  const rowMatches = searchResult.matches.get(rowIndex)
  if (!rowMatches) return <>{text}</>

  const parts = getParts(rowMatches, searchResult.pattern.length, text.length)

  return (
    <span>
      {parts.map(({ start, end, isMatch }, i) => {
        const part = text.slice(start, end)
        if (!isMatch) return <span key={i}>{part}</span>
        const isSelected =
          searchResult.selectedMatch?.rowIndex === rowIndex && searchResult.selectedMatch?.charIndex === start
        return (
          <span key={i} style={{ backgroundColor: isSelected ? 'orange' : 'yellow', color: 'black' }}>
            {part}
          </span>
        )
      })}
    </span>
  )
}
