import { useQuery } from '@tanstack/react-query'
import { authedFetch } from '../../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../../routes/translation/routes'
import { store, STORE_KEYS, StoreUserInfos } from '../../store/store'
import { TranslationList } from './TranslationList'
import { AddIcon } from '../../components/icons/AddIcon'
import { useMemo, useState } from 'react'
import { CreateTranslationModal } from './CreateTranslationModal'
import { TranslationType } from '../../routes/translation/schemas'
import { TRANSLATION_APP_PAGES } from '../../routes/pages/routes'
import { useNavigate } from 'react-router'
import { reviewSignoffs } from '../../modules/prMarkers/reviewSignoffs'

const TRANSLATION_LABEL = 'Traduction'
const WIP_LABEL = 'En cours'

const hasWipLabel = (pr: TranslationType) => pr.labels.some((label) => label.name === WIP_LABEL)
const isMerged = (pr: TranslationType) => !!pr.merged_at && pr.state === 'closed'

type LifecycleColumn = 'wip' | 'changes-requested' | 'awaiting-review' | 'to-test'

/**
 * The lifecycle column an *open* translation belongs to, derived from its backing PR — the WIP
 * label plus the corrector and QA sign-off counts — per docs/adr/0001-two-stage-translation-review.md.
 * Nothing is stored as explicit state; merged translations ("Terminée") are handled separately.
 *
 * A change-request from *either* stage takes precedence over the approval-count columns: a
 * translation awaiting the author's fixes lands in the shared "Changements demandés" column
 * regardless of how many approvals it has. Once both change-request lists are cleared (resubmit),
 * a translation with two corrector approvals returns straight to "À tester".
 */
const deriveOpenColumn = (pr: TranslationType): LifecycleColumn => {
  if (hasWipLabel(pr)) return 'wip'
  if (reviewSignoffs.changeRequests(pr.body).length > 0 || reviewSignoffs.qaChangeRequests(pr.body).length > 0)
    return 'changes-requested'
  if (reviewSignoffs.approvals(pr.body).length >= 2) return 'to-test'
  return 'awaiting-review'
}

const isPrReviewed = (approvals: string[], requestedChanges: string[]) => {
  return approvals.length >= 2 || requestedChanges.length > 0
}

const mapPRToTranslation = (pr: TranslationType, isYours: boolean) => {
  const approvals = reviewSignoffs.approvals(pr.body)
  const requestedChanges = reviewSignoffs.changeRequests(pr.body)

  return {
    id: pr.id,
    title: pr.title,
    author: pr.user.login,
    authorAvatar: pr.user.avatar_url,
    approvals,
    requestedChanges,
    href:
      pr.labels.some((label) => label.name === WIP_LABEL) && pr.state === 'open' && isYours
        ? TRANSLATION_APP_PAGES.TRANSLATION.EDIT(pr.head.ref.toString(), pr.title.toString())
        : TRANSLATION_APP_PAGES.TRANSLATION.REVIEW(
            pr.head.ref.toString(),
            pr.title.toString(),
            isYours,
            isPrReviewed(approvals, requestedChanges)
          )
  }
}

const getTranslations = async () => {
  const userInfos = await store.get<StoreUserInfos>(STORE_KEYS.USER_INFOS)
  if (!userInfos) throw new Error('No token found')

  const data = await authedFetch({
    route: TRANSLATION_API_URLS.TRANSLATIONS.LIST
  })

  const prs = data.filter((pr) => pr.labels.some((label) => label.name === TRANSLATION_LABEL))

  const translationMapper = (pr: TranslationType) => mapPRToTranslation(pr, pr.user.id === userInfos.id)

  const open = prs.filter((pr) => pr.state === 'open')
  const openInColumn = (column: LifecycleColumn) =>
    open.filter((pr) => deriveOpenColumn(pr) === column).map(translationMapper)

  return {
    yourTranslations: open.filter((pr) => pr.user.id === userInfos.id).map(translationMapper),
    wipTranslations: openInColumn('wip'),
    changesRequestedTranslations: openInColumn('changes-requested'),
    waitingForReviewTranslations: openInColumn('awaiting-review'),
    toTestTranslations: openInColumn('to-test'),
    doneTranslations: prs.filter(isMerged).map(translationMapper)
  }
}

export const OverviewView = () => {
  const navigate = useNavigate()
  const [isCreateTranslationModalVisible, setIsCreateTranslationModalVisible] = useState(false)

  const { data, isError } = useQuery({
    queryKey: ['all-translations'],
    queryFn: getTranslations,
    refetchOnMount: 'always'
  })

  if (isError) {
    store.delete(STORE_KEYS.USER_INFOS).then(() => navigate(TRANSLATION_APP_PAGES.HOME))
  }

  const translationLists = useMemo(() => {
    if (!data) return []

    return [
      {
        title: 'Vos traductions',
        translations: data.yourTranslations,
        extraElements: (
          <button className="btn btn-primary btn-lg" onClick={() => setIsCreateTranslationModalVisible(true)}>
            <AddIcon />
            Commencer une traduction
          </button>
        )
      },
      {
        title: 'En cours',
        translations: data.wipTranslations
      },
      {
        title: 'Changements demandés',
        translations: data.changesRequestedTranslations
      },
      {
        title: 'En attente de relecture',
        translations: data.waitingForReviewTranslations
      },
      {
        title: 'À tester',
        translations: data.toTestTranslations
      },
      {
        title: 'Terminée',
        translations: data.doneTranslations
      }
    ]
  }, [data])

  if (isError) {
    return <main></main>
  }

  return (
    <>
      <main className="h-screen mx-auto max-w-[1700px] w-full flex flex-col gap-6 py-8 px-4">
        <div className="flex flex-row items-center gap-3">
          <h1 className="text-center text-4xl font-bold flex-1">Vue d'ensemble</h1>
          <BetaQaButton />
          <LogoutButton />
        </div>
        <section className="flex flex-row w-full gap-2 h-full relative">
          {translationLists.map((list) => (
            <TranslationList
              key={list.title}
              className="w-full"
              flexClassName="h-[calc(100svh-220px)]"
              title={list.title}
              translations={list.translations}
              extraElements={list.extraElements}
            />
          ))}
        </section>
      </main>
      <CreateTranslationModal
        isVisible={isCreateTranslationModalVisible}
        onClose={() => setIsCreateTranslationModalVisible(false)}
      />
    </>
  )
}

const LogoutButton = () => {
  const navigate = useNavigate()
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await store.delete(STORE_KEYS.USER_INFOS)
        await navigate(TRANSLATION_APP_PAGES.HOME)
      }}
    >
      Se déconnecter
    </button>
  )
}

const BetaQaButton = () => {
  const navigate = useNavigate()
  return (
    <button className="btn btn-soft h-auto py-2" onClick={() => navigate(TRANSLATION_APP_PAGES.BETA_QA)}>
      Relecture de la beta
    </button>
  )
}
