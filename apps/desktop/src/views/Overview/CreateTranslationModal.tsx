import { useRef } from 'react'
import { Modal } from '../../components/Modal'
import { useMutation } from '@tanstack/react-query'
import { TRANSLATION_APP_PAGES } from '../../routes/pages/routes'
import { useNavigate } from 'react-router'
import { TRANSLATION_API_URLS } from '../../routes/translation/routes'
import { authedFetch } from '../../modules/fetching/fetcher'

type CreateTranslationModalProps = {
  isVisible: boolean
  onClose: () => void
}

const createTranslation = async (name: string) => {
  return await authedFetch({
    route: TRANSLATION_API_URLS.TRANSLATIONS.CREATE,
    body: { name }
  })
}

export const CreateTranslationModal = ({ isVisible, onClose }: CreateTranslationModalProps) => {
  const navigate = useNavigate()

  const { isPending, mutate } = useMutation({
    mutationKey: ['create-translation'],
    mutationFn: createTranslation,
    onSuccess: async (data) => {
      onClose()
      await navigate(TRANSLATION_APP_PAGES.TRANSLATION.EDIT(data.head.ref, data.title))
    }
  })

  const titleRef = useRef<HTMLInputElement>(null)

  return (
    <Modal
      label="Commencer une nouvelle traduction"
      isVisible={isVisible}
      onClose={onClose}
      className="min-w-[550px]"
      actions={
        <>
          <button className="float-right btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            disabled={isPending}
            className="float-right btn btn-primary"
            onClick={() => (titleRef.current?.value ? mutate(titleRef.current.value) : undefined)}
          >
            {isPending && <span className="loading loading-spinner" />}
            Valider
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="translation_theme" className="block w-fit">
          Quel sera le thème de cette traduction ?
        </label>
        <input
          ref={titleRef}
          id="translation_theme"
          type="text"
          placeholder="Ex: Boutique de Spamton"
          className="input"
        />
      </div>
    </Modal>
  )
}
