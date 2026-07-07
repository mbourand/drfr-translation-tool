import { openUrl } from '@tauri-apps/plugin-opener'
import { NotionIcon } from './icons/NotionIcon'

// Shared link to the team's translation bible on Notion, reachable from every page.
const NOTION_URL = 'https://app.notion.com/p/Bible-de-traduction-27d758f5f33980f68528c24ca6885d5c'

type NotionButtonProps = {
  // `header` sits in the page header next to the other soft buttons; `footer` stacks in the side
  // panel footer alongside the action buttons (full-width, standard height).
  variant?: 'header' | 'footer'
}

export const NotionButton = ({ variant = 'header' }: NotionButtonProps) => {
  const openNotion = () => openUrl(NOTION_URL)

  return (
    <button
      className={variant === 'footer' ? 'btn btn-soft' : 'btn btn-soft h-auto py-2'}
      onClick={openNotion}
    >
      <NotionIcon />
      Bible de traduction
    </button>
  )
}
