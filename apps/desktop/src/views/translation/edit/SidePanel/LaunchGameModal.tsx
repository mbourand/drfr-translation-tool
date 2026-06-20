import { Modal } from '../../../../components/Modal'
import { patchAndLaunchGame, PatchGameTranslationFile } from '../../../../modules/game/launch'
import { open } from '@tauri-apps/plugin-dialog'
import { store, STORE_KEYS } from '../../../../store/store'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { fetchData } from '../../../../modules/fetching/fetcher'
import { STATIC_ROUTES } from '../../../../routes/static/routes'
import { ENV } from '../../../../Env'
import { repairGameFiles } from '../../../../modules/game/repair'
import { invoke } from '@tauri-apps/api/core'
import { RUST_COMMANDS } from '../../../../modules/commands/commands'
import { platform } from '@tauri-apps/plugin-os'

type LaunchGameModalProps = {
  isVisible: boolean
  onClose: () => void
  files: PatchGameTranslationFile[]
  changes: Map<string, string>
}

export const LaunchGameModal = ({ onClose, isVisible, files, changes }: LaunchGameModalProps) => {
  const { data: gameFolder, refetch: refetchGameFolder } = useQuery({
    queryKey: [STORE_KEYS.GAME_FOLDER_PATH],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.GAME_FOLDER_PATH)
      return folder ?? null
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const { data: utmtCliFolder, refetch: refetchUtmtCliFolder } = useQuery({
    queryKey: [STORE_KEYS.UTMT_CLI_FOLDER_PATH],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.UTMT_CLI_FOLDER_PATH)
      return folder ?? null
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const { data: gitFolder, refetch: refetchGitFolder } = useQuery({
    queryKey: [STORE_KEYS.GIT_FOLDER_PATH],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.GIT_FOLDER_PATH)
      return folder ?? null
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const { data: savesFolder, refetch: refetchSavesFolder } = useQuery({
    queryKey: [STORE_KEYS.SAVES_FOLDER_PATH],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.SAVES_FOLDER_PATH)
      return folder ?? null
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const { data: selectedSaveFiles, refetch: refetchSelectedSaveFiles } = useQuery({
    queryKey: [STORE_KEYS.LAST_SELECTED_SAVE_NAME],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.LAST_SELECTED_SAVE_NAME)
      return folder ?? null
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const { data: deltaruneSavesIndex } = useQuery({
    queryKey: ['deltaruneSavesIndex'],
    queryFn: async () => {
      const response = await fetchData({ route: STATIC_ROUTES.SAVES.INDEX })
      return response
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  const [isLoading, setIsLoading] = useState(false)
  const onlyPatchChangedFilesInputRef = useRef<HTMLInputElement>(null)

  // On Linux, Deltarune runs as the Windows build through Steam Proton, so its saves live inside
  // the Proton prefix rather than a native location. The picker stays manual (like the other three
  // folders); we only point the translator at the right place. See ADR 0001-linux-support-via-steam-proton.
  const isLinux = platform() === 'linux'

  return (
    <Modal
      onClose={onClose}
      isVisible={isVisible}
      label="Lancer le jeu"
      className="!max-w-[700px]"
      actions={
        <>
          <button className="float-right btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="float-right btn btn-soft"
            onClick={async () => {
              if (gameFolder) {
                await repairGameFiles(gameFolder)
                alert(
                  'Les fichiers de cache de la traduction ont été supprimés. Vérifiez les fichiers du jeu sur steam, puis réessayez de lancer le jeu.'
                )
              }
            }}
          >
            Réparer
          </button>
          <button
            className="float-right btn btn-soft"
            onClick={async () => {
              if (!gitFolder) return

              try {
                await invoke(RUST_COMMANDS.PULL_CHANGES_FROM_GIT, { gitFolder })
                alert('La mise à jour des fichiers a été effectuée avec succès.')
              } catch (error) {
                console.error('Error pulling changes from git:')
                console.error(error)
                alert(`La mise à jour a échoué. Erreur: ${error}. Vérifiez les logs pour plus d'informations.`)
              }
            }}
          >
            Mettre à jour les fichiers git
          </button>
          <button
            disabled={!gameFolder || !utmtCliFolder}
            className="float-right btn btn-primary"
            onClick={async () => {
              if (!gameFolder || !utmtCliFolder || !gitFolder || !savesFolder || !selectedSaveFiles) return
              const selectedSaveFilesData = deltaruneSavesIndex?.find((save) => save.name === selectedSaveFiles)
              if (!selectedSaveFilesData) return

              const changesArray = Array.from(changes.entries())

              const filesToPatch = onlyPatchChangedFilesInputRef.current?.checked
                ? files.filter((file) => changesArray.some(([key]) => key.startsWith(file.pathInGitFolder)))
                : files

              setIsLoading(true)
              await patchAndLaunchGame({
                gameFolder,
                utmtCliFolder,
                gitFolder,
                savesFolder,
                savesFiles: selectedSaveFilesData.files.map((file) => ({
                  name: file,
                  url: ENV.DRFR_WEBSITE_URL + '/translation-tool/saves/' + selectedSaveFilesData.path + '/' + file
                })),
                files: filesToPatch
              })
              setIsLoading(false)
              onClose()
            }}
          >
            {isLoading && <span className="loading loading-spinner" />}
            Lancer le jeu
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="select-game-folder">Sélectionnez le dossier de Deltarune</label>
          <button
            id="select-game-folder"
            className="btn btn-soft"
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
                title: 'Sélectionnez le dossier de votre jeu'
              })

              if (selected && typeof selected === 'string') {
                await store.set(STORE_KEYS.GAME_FOLDER_PATH, selected)
                await store.save()
                refetchGameFolder()
              }
            }}
          >
            {gameFolder ?? 'Sélectionner un dossier'}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="select-utmt-folder">Sélectionnez le dossier d'UTMT CLI</label>
          <button
            id="select-utmt-folder"
            className="btn btn-soft"
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
                title: "Sélectionnez le dossier d'UTMT CLI"
              })

              if (selected && typeof selected === 'string') {
                await store.set(STORE_KEYS.UTMT_CLI_FOLDER_PATH, selected)
                await store.save()
                refetchUtmtCliFolder()
              }
            }}
          >
            {utmtCliFolder ?? 'Sélectionner un dossier'}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="select-git-folder">Sélectionnez le dossier du repo git du Patch FR</label>
          <button
            id="select-git-folder"
            className="btn btn-soft"
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
                title: 'Sélectionnez le dossier du dépôt git'
              })

              if (selected && typeof selected === 'string') {
                await store.set(STORE_KEYS.GIT_FOLDER_PATH, selected)
                await store.save()
                refetchGitFolder()
              }
            }}
          >
            {gitFolder ?? 'Sélectionner un dossier'}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="select-saves-folder">Sélectionnez le dossier des sauvegardes de DELTARUNE</label>
          <button
            id="select-saves-folder"
            className="btn btn-soft"
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
                title: 'Sélectionnez le dossier des sauvegardes de DELTARUNE'
              })

              if (selected && typeof selected === 'string') {
                await store.set(STORE_KEYS.SAVES_FOLDER_PATH, selected)
                await store.save()
                refetchSavesFolder()
              }
            }}
          >
            {savesFolder ?? 'Sélectionner un dossier'}
          </button>
          {isLinux && (
            <div className="text-sm opacity-70 flex flex-col gap-1">
              <span>
                Sous Linux, les sauvegardes se trouvent dans le préfixe Proton, sous{' '}
                <code className="break-all">
                  compatdata/1671210/pfx/drive_c/users/steamuser/AppData/Local/DELTARUNE
                </code>
                . Le début du chemin dépend de votre installation de Steam :
              </span>
              <span>
                • Steam natif :{' '}
                <code className="break-all">
                  ~/.local/share/Steam/steamapps/compatdata/1671210/pfx/drive_c/users/steamuser/AppData/Local/DELTARUNE
                </code>
              </span>
              <span>
                • Steam Flatpak :{' '}
                <code className="break-all">
                  ~/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/1671210/pfx/drive_c/users/steamuser/AppData/Local/DELTARUNE
                </code>
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="select-save">Sélectionnez la sauvegarde que vous souhaitez utiliser</label>
          <select
            id="select-save"
            className="select w-full"
            onChange={async (e) => {
              await store.set(STORE_KEYS.LAST_SELECTED_SAVE_NAME, e.target.value)
              await store.save()
              refetchSelectedSaveFiles()
            }}
          >
            {deltaruneSavesIndex?.map((save) => (
              <option key={save.name} value={save.name}>
                {save.name}
              </option>
            ))}
          </select>
        </div>
        {changes.size > 0 && (
          <label className="flex flex-row gap-2" htmlFor="only-patch-changes">
            <input
              ref={onlyPatchChangedFilesInputRef}
              id="only-patch-changes"
              type="checkbox"
              defaultChecked
              className="checkbox !shadow-none"
            />
            Ne patcher que les fichiers modifiés
          </label>
        )}
      </div>
    </Modal>
  )
}
