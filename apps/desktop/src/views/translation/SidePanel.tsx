import { ReactNode } from 'react'
import { FolderIcon } from '../../components/icons/FolderIcon'
import { ThemeButton } from '../../components/ThemeButton'
import { TranslationFile } from '../../types/translation'

type TranslationSidePanelProps = {
  title: string
  categories: Record<string, TranslationFile[]>
  selected: TranslationFile | null
  onSelected: (file: TranslationFile) => void
  renderFileDecoration?: (file: TranslationFile) => ReactNode
  footer?: ReactNode
}

export const TranslationSidePanel = ({
  title,
  categories,
  selected,
  onSelected,
  renderFileDecoration,
  footer
}: TranslationSidePanelProps) => {
  return (
    <div className="drawer lg:drawer-open w-fit z-30">
      <input id="my-drawer-2" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col items-center justify-center">
        <label htmlFor="my-drawer-2" className="btn btn-primary drawer-button lg:hidden">
          Open drawer
        </label>
      </div>
      <div className="drawer-side">
        <label htmlFor="my-drawer-2" aria-label="close sidebar" className="drawer-overlay"></label>
        <ul className="menu bg-base-200 text-base-content min-h-full w-80 p-4 h-full">
          <div className="flex flex-row justify-between w-full items-center mb-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <ThemeButton />
          </div>

          {Object.entries(categories).map(([category, files]) => (
            <li key={category}>
              <summary>
                <FolderIcon />
                {category}
              </summary>
              <ul>
                {files.map((file) => (
                  <li key={file.translatedPath}>
                    <button
                      className={
                        selected?.translatedPath === file.translatedPath ? 'menu-active flex items-center' : ''
                      }
                      onClick={() => onSelected(file)}
                    >
                      {file.name}
                      {renderFileDecoration?.(file)}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}

          {footer && <div className="mt-auto flex flex-col gap-3">{footer}</div>}
        </ul>
      </div>
    </div>
  )
}
