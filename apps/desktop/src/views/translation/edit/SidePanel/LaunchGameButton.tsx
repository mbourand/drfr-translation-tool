import { useState } from 'react'
import { LaunchGameModal } from './LaunchGameModal'
import { PatchGameTranslationFile } from '../../../../modules/game/launch'

type LaunchGameButtonProps = {
  files: PatchGameTranslationFile[]
  changes: Map<string, string>
}

export const LaunchGameButton = ({ files, changes }: LaunchGameButtonProps) => {
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)

  return (
    <>
      <button className="btn btn-soft btn-primary" onClick={() => setIsSaveModalVisible(true)}>
        Lancer le jeu
      </button>
      <LaunchGameModal
        isVisible={isSaveModalVisible}
        onClose={() => setIsSaveModalVisible(false)}
        files={files}
        changes={changes}
      />
    </>
  )
}
