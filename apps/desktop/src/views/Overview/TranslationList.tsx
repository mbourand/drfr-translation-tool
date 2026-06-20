import { ReactNode } from 'react'
import { To, useNavigate } from 'react-router'
import { twMerge } from 'tailwind-merge'
import { CheckIcon } from '../../components/icons/CheckIcon'
import { CrossIcon } from '../../components/icons/CrossIcon'

type TranslationListProps = {
  title: string
  translations: {
    id: number
    title: string
    approvals: string[]
    requestedChanges: string[]
    qaApprovals: string[]
    qaChangeRequests: string[]
    author: string
    authorAvatar: string
    href: To
  }[]
  className?: string
  flexClassName?: string
  extraElements?: ReactNode
}

const ReviewerAvatars = ({ users }: { users: string[] }) => (
  <>
    {users.map((user) => (
      <div className="rounded-full min-w-[calc(24px-12px)] min-h-6 w-[calc(24px-12px)] h-6" key={user}>
        <div className="tooltip" data-tip={user}>
          <img
            className="rounded-full min-w-6 min-h-6 w-6 h-6"
            src={`https://github.com/${user}.png?size=128`}
            alt=""
          />
        </div>
      </div>
    ))}
  </>
)

/**
 * The card's review feedback in one row: everyone who approved (green check) then everyone who
 * requested changes (red cross). Correction and QA sign-offs are merged — the fresh-eyes rule keeps
 * the two sets of people disjoint, so a reviewer never appears twice.
 */
const ReviewRow = ({ approvals, changeRequests }: { approvals: string[]; changeRequests: string[] }) => {
  if (approvals.length + changeRequests.length === 0) return null

  return (
    <div className="flex flex-row items-center mt-2">
      {approvals.length > 0 && (
        <>
          <div className="text-success mr-[2px]">
            <CheckIcon />
          </div>
          <ReviewerAvatars users={approvals} />
        </>
      )}
      {changeRequests.length > 0 && (
        <div className={twMerge('flex flex-row', approvals.length > 0 ? 'ml-4' : '')}>
          <div className="text-error mr-[2px]">
            <CrossIcon />
          </div>
          <ReviewerAvatars users={changeRequests} />
        </div>
      )}
    </div>
  )
}

export const TranslationList = ({
  title,
  translations,
  className,
  flexClassName,
  extraElements
}: TranslationListProps) => {
  const navigate = useNavigate()

  return (
    <div className={twMerge('rounded-box shadow-md border border-base-200', className)}>
      <h2 className="p-4 pb-2 text-xl font-semibold tracking-wide">{title}</h2>
      <div className={twMerge('flex flex-col bg-base-100 rounded-box p-2 overflow-auto gap-4', flexClassName)}>
        {translations.map((translation) => (
          <button
            key={translation.id}
            className="border border-base-200 rounded-box p-4 group text-left cursor-pointer hover:shadow-md"
            onClick={() => navigate(translation.href)}
          >
            <h3 className="text-lg font-semibold group-hover:underline underline-offset-2 mb-4">{translation.title}</h3>
            <div className="flex flex-row justify-end">
              <div className="flex items-center gap-2">
                <p className="opacity-60 w-fit text-sm">par {translation.author}</p>
                <div className="avatar w-8">
                  <img className="rounded-full" src={translation.authorAvatar} />
                </div>
              </div>
            </div>
            <ReviewRow
              approvals={[...translation.approvals, ...translation.qaApprovals]}
              changeRequests={[...translation.requestedChanges, ...translation.qaChangeRequests]}
            />
          </button>
        ))}
        {extraElements}
      </div>
    </div>
  )
}
