import { twMerge } from 'tailwind-merge'
import {
  BetaReport,
  CATEGORY_DISPLAY,
  SEVERITY_DISPLAY,
  STATUS_DISPLAY
} from '../../routes/beta-reports/schemas'
import { getReportCategory, getReportSeverity, getReportStatus } from './reportSelectors'

type BetaReportCardProps = {
  report: BetaReport
  isSelected: boolean
  onClick: () => void
}

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  minor: 'badge-success',
  major: 'badge-warning',
  blocker: 'badge-error'
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  'pris-en-compte': 'badge-primary',
  'a-retester': 'badge-secondary',
  corrige: 'badge-success',
  ignore: 'badge-ghost'
}

export const BetaReportCard = ({ report, isSelected, onClick }: BetaReportCardProps) => {
  const category = getReportCategory(report)
  const severity = getReportSeverity(report)
  const status = getReportStatus(report)

  return (
    <button
      className={twMerge(
        'border border-base-200 rounded-box p-3 text-left cursor-pointer hover:shadow-md w-full',
        isSelected && 'border-primary shadow-md'
      )}
      onClick={onClick}
    >
      <div className="flex flex-row gap-2 mb-2 flex-wrap">
        {status && (
          <span className={twMerge('badge badge-sm', STATUS_BADGE_CLASS[status])}>{STATUS_DISPLAY[status]}</span>
        )}
        {severity && (
          <span className={twMerge('badge badge-sm', SEVERITY_BADGE_CLASS[severity])}>{SEVERITY_DISPLAY[severity]}</span>
        )}
        {category && <span className="badge badge-sm badge-outline">{CATEGORY_DISPLAY[category]}</span>}
      </div>
      <h3 className="font-semibold mb-1">#{report.number} — {report.title}</h3>
      <div className="flex items-center gap-2 mt-2">
        <div className="avatar w-5">
          <img className="rounded-full" src={report.user.avatar_url} alt="" />
        </div>
        <p className="text-xs opacity-60">par {report.user.login}</p>
      </div>
    </button>
  )
}
