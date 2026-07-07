import { Modal } from '../../../../components/Modal'
import { TranslationFile } from '../../../../types/translation'
import { useSaveChanges } from '../../../../hooks/useSaveChanges'
import { showToast } from '../../../../components/Toaster/toastStore'
import { useEffect } from 'react'

type SaveChangesModalProps = {
  isVisible: boolean
  onClose: () => void
  branch: string
  files: TranslationFile[]
  changes: Map<string, string>
  onSaveSuccess?: () => void
}

export const SaveChangesModal = ({
  onClose,
  isVisible,
  branch,
  files,
  changes,
  onSaveSuccess
}: SaveChangesModalProps) => {
  const { isPending, mutate } = useSaveChanges({
    changes,
    files,
    branch,
    onSaveSuccess: () => {
      onClose()
      onSaveSuccess?.()
    },
    onSaveError: () => {
      onClose()
      showToast('La sauvegarde a échoué, veuillez réessayer.', 'error')
    }
  })

  useEffect(() => {
    if (isVisible && !isPending) {
      mutate()
    }
  }, [isVisible])

  return (
    <Modal isVisible={isVisible} label="Sauvegarde">
      Sauvegarde en cours, veuillez patienter...
    </Modal>
  )
}
