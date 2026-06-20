import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Modal } from '../../../components/Modal'
import { authedFetch } from '../../../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'

const REQUIRED_QA_APPROVALS = 2

type QaReviewPanelProps = {
  branch: string
  /** How many distinct QA approvals the translation already has. */
  qaApprovalCount: number
  /** True once the translation has the two QA approvals it needs (QA-passed, awaiting a staff merge). */
  isReady: boolean
  /** Whether the current user may act as QA (fresh eyes: not the author, not a corrector). */
  isEligible: boolean
}

/**
 * The QA review surface shown on a translation that has reached "À tester" (two corrector approvals).
 * Everyone sees the QA approval count and the ready flag; only an eligible (fresh-eyes) reviewer is
 * offered the approve / request-changes actions. A QA pass never auto-merges — staff merge manually.
 */
export const QaReviewPanel = ({ branch, qaApprovalCount, isReady, isEligible }: QaReviewPanelProps) => {
  const navigate = useNavigate()
  const [isApproveModalVisible, setIsApproveModalVisible] = useState(false)
  const [isRequestChangesModalVisible, setIsRequestChangesModalVisible] = useState(false)

  const approve = useMutation({
    mutationKey: ['qa-approve', branch],
    mutationFn: async () => {
      await authedFetch({ route: TRANSLATION_API_URLS.TRANSLATIONS.QA_APPROVE, body: { branch } })
    },
    onSuccess: () => {
      setIsApproveModalVisible(false)
      navigate(TRANSLATION_APP_PAGES.OVERVIEW)
    }
  })

  const requestChanges = useMutation({
    mutationKey: ['qa-request-changes', branch],
    mutationFn: async () => {
      await authedFetch({ route: TRANSLATION_API_URLS.TRANSLATIONS.QA_REQUEST_CHANGES, body: { branch } })
    },
    onSuccess: () => {
      setIsRequestChangesModalVisible(false)
      navigate(TRANSLATION_APP_PAGES.OVERVIEW)
    }
  })

  return (
    <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
      <div className="flex flex-row items-center justify-between">
        <span className="font-semibold">Assurance qualité</span>
        <span className={`badge ${isReady ? 'badge-success' : 'badge-ghost'}`}>
          {isReady ? 'Prête' : `QA : ${qaApprovalCount} / ${REQUIRED_QA_APPROVALS}`}
        </span>
      </div>

      {isEligible ? (
        <>
          <button className="btn btn-soft btn-primary" onClick={() => setIsRequestChangesModalVisible(true)}>
            Demander des modifications
          </button>
          <button className="btn btn-primary" onClick={() => setIsApproveModalVisible(true)}>
            Valider la QA
          </button>
        </>
      ) : (
        <p className="text-sm opacity-70">
          Vous ne pouvez pas relire cette traduction en QA : seules de nouvelles personnes (ni l'auteur ni un correcteur)
          le peuvent.
        </p>
      )}

      <Modal
        onClose={() => setIsApproveModalVisible(false)}
        isVisible={isApproveModalVisible}
        label="Valider la QA"
        actions={
          <>
            <button className="float-right btn btn-ghost" onClick={() => setIsApproveModalVisible(false)}>
              Annuler
            </button>
            <button
              disabled={approve.isPending}
              className="float-right btn btn-primary"
              onClick={() => approve.mutate()}
            >
              {approve.isPending && <span className="loading loading-spinner" />}
              Confirmer
            </button>
          </>
        }
      >
        <p>
          Vous êtes sur le point de valider cette traduction en assurance qualité. Au bout de deux validations QA, elle
          sera prête à être fusionnée par le staff.
          <br />
          <br />
          <b>Assurez-vous d'avoir relu tous les fichiers modifiés avant de confirmer.</b>
        </p>
      </Modal>

      <Modal
        onClose={() => setIsRequestChangesModalVisible(false)}
        isVisible={isRequestChangesModalVisible}
        label="Demander des modifications"
        actions={
          <>
            <button className="float-right btn btn-ghost" onClick={() => setIsRequestChangesModalVisible(false)}>
              Annuler
            </button>
            <button
              disabled={requestChanges.isPending}
              className="float-right btn btn-primary"
              onClick={() => requestChanges.mutate()}
            >
              {requestChanges.isPending && <span className="loading loading-spinner" />}
              Confirmer
            </button>
          </>
        }
      >
        <p>
          Vous êtes sur le point de demander des modifications à l'auteur. La traduction repassera dans « Changements
          demandés » ; une fois corrigée, elle reviendra directement en « À tester » sans nouvelle relecture des
          correcteurs.
        </p>
      </Modal>
    </div>
  )
}
