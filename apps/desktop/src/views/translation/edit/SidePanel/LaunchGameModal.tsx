import { Modal } from '../../../../components/Modal'
import { patchAndLaunchGame, PatchGameTranslationFile } from '../../../../modules/game/launch'
import { ensureBranchSynced, FirstTimeSetupError, SyncAuthError } from '../../../../modules/game/sync'
import { open } from '@tauri-apps/plugin-dialog'
import { store, STORE_KEYS } from '../../../../store/store'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { repairGameFiles } from '../../../../modules/game/repair'
import { platform } from '@tauri-apps/plugin-os'
import { useNavigate } from 'react-router'
import { logout } from '../../../../modules/auth/login'
import { TRANSLATION_APP_PAGES } from '../../../../routes/pages/routes'

// Offline-fallback notice shown when an update check/download failed but a cached copy was launched.
const OFFLINE_FALLBACK_LAUNCH_NOTICE =
  'Impossible de vérifier les mises à jour — lancement avec votre version actuelle.'

type LaunchGameModalProps = {
  isVisible: boolean
  onClose: () => void
  // The patcher branch to sync, patch, and launch from — `master` for edit/review, `beta` for Beta
  // QA. Each branch keeps its own `patcher/<branch>/` copy, so switching modes never re-downloads.
  branch: string
  files: PatchGameTranslationFile[]
  changes: Map<string, string>
}

export const LaunchGameModal = ({ onClose, isVisible, branch, files, changes }: LaunchGameModalProps) => {
  const { data: gameFolder, refetch: refetchGameFolder } = useQuery({
    queryKey: [STORE_KEYS.GAME_FOLDER_PATH],
    queryFn: async () => {
      const folder = await store.get<string>(STORE_KEYS.GAME_FOLDER_PATH)
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

  const [isLoading, setIsLoading] = useState(false)
  const onlyPatchChangedFilesInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // An expired GitHub session can't be recovered in place: drop the stored token and route the user
  // through the normal re-login. Returns true when it handled the error so callers can stop there.
  const handleSyncAuthError = async (error: unknown): Promise<boolean> => {
    if (!(error instanceof SyncAuthError)) return false
    await logout()
    await navigate(TRANSLATION_APP_PAGES.AUTH.LOGIN)
    return true
  }

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
              try {
                setIsLoading(true)
                // Force-refresh: re-download regardless of the stored SHA (the manual escape hatch).
                const { status } = await ensureBranchSynced(branch, { force: true })
                if (status === 'offline-fallback') {
                  alert('Impossible de vérifier les mises à jour. Votre version actuelle est conservée.')
                } else {
                  alert('La mise à jour des fichiers a été effectuée avec succès.')
                }
              } catch (error) {
                if (await handleSyncAuthError(error)) return
                if (error instanceof FirstTimeSetupError) return alert(error.message)
                console.error('Error syncing branch content:')
                console.error(error)
                alert(`La mise à jour a échoué. Erreur: ${error}. Vérifiez les logs pour plus d'informations.`)
              } finally {
                setIsLoading(false)
              }
            }}
          >
            Mettre à jour les fichiers
          </button>
          <button
            disabled={!gameFolder || !savesFolder}
            className="float-right btn btn-primary"
            onClick={async () => {
              if (!gameFolder || !savesFolder) return

              const changesArray = Array.from(changes.entries())

              const filesToPatch = onlyPatchChangedFilesInputRef.current?.checked
                ? files.filter((file) => changesArray.some(([key]) => key.startsWith(file.pathInGitFolder)))
                : files

              setIsLoading(true)
              try {
                // Ensure the target branch is fresh before patching: SHA-gated so an unchanged branch
                // skips the download, fail-soft so an offline blip still launches from the last-good copy.
                const { gitFolder, status } = await ensureBranchSynced(branch)
                if (status === 'offline-fallback') alert(OFFLINE_FALLBACK_LAUNCH_NOTICE)
                await patchAndLaunchGame({
                  gameFolder,
                  gitFolder,
                  savesFolder,
                  files: filesToPatch
                })
                onClose()
              } catch (error) {
                if (await handleSyncAuthError(error)) return
                if (error instanceof FirstTimeSetupError) return alert(error.message)
                console.error('Error launching the game:')
                console.error(error)
                alert(`Le lancement a échoué. Erreur: ${error}. Vérifiez les logs pour plus d'informations.`)
              } finally {
                setIsLoading(false)
              }
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
