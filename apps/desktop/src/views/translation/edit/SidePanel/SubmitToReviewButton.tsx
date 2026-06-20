import { useState } from 'react'
import { Modal } from '../../../../components/Modal'
import { TRANSLATION_API_URLS } from '../../../../routes/translation/routes'
import { useMutation } from '@tanstack/react-query'
import { authedFetch } from '../../../../modules/fetching/fetcher'
import { useNavigate } from 'react-router'
import { TRANSLATION_APP_PAGES } from '../../../../routes/pages/routes'
import { TranslationFile } from '../../../../types/translation'
import { useSaveChanges } from '../../../../hooks/useSaveChanges'

type SubmitToReviewButtonProps = {
  branch: string
  files: TranslationFile[]
  changes: Map<string, string>
}

export const SubmitToReviewButton = ({ branch, files, changes }: SubmitToReviewButtonProps) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const navigate = useNavigate()

  const submitQuery = useMutation({
    mutationKey: ['submit-to-review', branch],
    mutationFn: async (branch: string) => {
      return await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.SUBMIT_TO_REVIEW,
        body: { branch }
      })
    }
  })

  const saveQuery = useSaveChanges({
    branch,
    files,
    changes
  })

  const saveAndSubmitQuery = useMutation({
    mutationKey: ['save-and-submit', branch],
    mutationFn: async (branch: string) => {
      console.log('Saving changes before submitting to review...')
      await saveQuery.mutateAsync()
      console.log('Changes saved, now submitting to review...')
      await submitQuery.mutateAsync(branch)
      console.log('Submitted to review successfully.')
    },
    onSuccess: async () => {
      setIsModalVisible(false)
      await navigate(TRANSLATION_APP_PAGES.OVERVIEW)
    }
  })

  return (
    <>
      <button className="btn btn-soft btn-primary" onClick={() => setIsModalVisible(true)}>
        Soumettre à la correction
      </button>
      <Modal
        isVisible={isModalVisible}
        label="Soumettre à la correction"
        onClose={() => setIsModalVisible(false)}
        actions={
          <>
            <button className="float-right btn btn-ghost" onClick={() => setIsModalVisible(false)}>
              Annuler
            </button>
            <button
              disabled={saveAndSubmitQuery.isPending}
              className="float-right btn btn-primary"
              onClick={() => saveAndSubmitQuery.mutate(branch)}
            >
              {saveAndSubmitQuery.isPending && <span className="loading loading-spinner" />}
              Soumettre
            </button>
          </>
        }
      >
        <p>
          Soumettre à la correction permettra aux autres traducteurs de relire vos changements. Ne soumettez qu'une fois
          que vous avez terminé votre traduction
          <br />
          <br />
          Êtes-vous sûr de vouloir soumettre cette traduction à la correction ?
        </p>
      </Modal>
    </>
  )
}
