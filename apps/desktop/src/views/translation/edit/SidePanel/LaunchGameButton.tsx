import { useState } from 'react'
import { LaunchGameModal } from './LaunchGameModal'
import { PatchGameTranslationFile } from '../../../../modules/game/launch'

type LaunchGameButtonProps = {
  // The patcher branch this view works against — `master` for edit/review, `beta` for Beta QA. The
  // launch flow syncs and patches from this branch's own `patcher/<branch>/` copy.
  branch: string
  files: PatchGameTranslationFile[]
  changes: Map<string, string>
}

export const LaunchGameButton = ({ branch, files, changes }: LaunchGameButtonProps) => {
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)

  return (
    <>
      <button className="btn btn-soft btn-primary" onClick={() => setIsSaveModalVisible(true)}>
        Lancer le jeu
      </button>
      <LaunchGameModal
        isVisible={isSaveModalVisible}
        onClose={() => setIsSaveModalVisible(false)}
        branch={branch}
        files={files}
        changes={changes}
      />
    </>
  )
}
