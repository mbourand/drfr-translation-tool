import { useMutation } from '@tanstack/react-query'
import { authedFetch } from '../../../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { Modal } from '../../../components/Modal'
import { useNavigate } from 'react-router'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'

type ApproveModalProps = {
  isVisible: boolean
  onClose: () => void
  branch: string
}

export const ApproveModal = ({ onClose, isVisible, branch }: ApproveModalProps) => {
  const navigate = useNavigate()

  const { isPending, mutate } = useMutation({
    mutationKey: ['approve-translation', branch],
    mutationFn: async () => {
      await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.APPROVE,
        body: { branch }
      })
    },
    onSuccess: () => {
      onClose()
      navigate(TRANSLATION_APP_PAGES.OVERVIEW)
    }
  })

  return (
    <Modal
      onClose={onClose}
      isVisible={isVisible}
      label="Approuver ces changements"
      actions={
        <>
          <button className="float-right btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button disabled={isPending} className="float-right btn btn-primary" onClick={() => mutate()}>
            {isPending && <span className="loading loading-spinner" />}
            Confirmer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p>
          Vous êtes sur le point d'approuver les modifications apportées. Une fois approuvée, le staff lira cette
          traduction pour pouvoir l'ajouter à la branche principale du patch. <br />
          <br />
          <b>
            Cette action est irréversible. Assurez-vous d'avoir bien relu tous les fichiers modifiés avant de confirmer
          </b>
        </p>
      </div>
    </Modal>
  )
}
