import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '../../modules/fetching/fetcher'
import { BETA_REPORTS_API_URLS } from '../../routes/beta-reports/routes'
import {
  BetaReport,
  CATEGORY_DISPLAY,
  SEVERITY_DISPLAY,
  STATUS_DISPLAY,
  STATUS_KEY_TO_LABEL,
  STATUS_LABEL_TO_KEY,
  StatusKey
} from '../../routes/beta-reports/schemas'
import { getReportCategory, getReportSeverity, getReportStatus } from './reportSelectors'
import { extractDescription, extractScreenshotUrls } from './reportBody'

type BetaReportDetailProps = {
  report: BetaReport
}

const stripStatusLabels = (labels: { name: string }[]): string[] =>
  labels.filter((l) => !STATUS_LABEL_TO_KEY[l.name]).map((l) => l.name)

const replaceStatusInLabels = (labels: { name: string }[], nextStatus: StatusKey): string[] => [
  ...stripStatusLabels(labels),
  STATUS_KEY_TO_LABEL[nextStatus]
]

export const BetaReportDetail = ({ report }: BetaReportDetailProps) => {
  const queryClient = useQueryClient()
  const description = extractDescription(report.body)
  const screenshotUrls = extractScreenshotUrls(report.body)
  const category = getReportCategory(report)
  const severity = getReportSeverity(report)
  const status = getReportStatus(report)

  // The mutation response is the authoritative new state. Apply it directly to every cached
  // list — drop from those whose state filter no longer matches, upsert into those that do.
  // We don't invalidate: GitHub's `?labels=beta-report` filtered list serves an async index
  // that lags behind writes by a few seconds (verified — the backend gets a 304 on the
  // filtered URL right after a write). Refetching in that window clobbers this update.
  const upsertReportInCache = (updated: BetaReport) => {
    const cachedQueries = queryClient.getQueriesData<BetaReport[]>({
      predicate: (query) => query.queryKey[0] === 'beta-reports'
    })
    for (const [queryKey, data] of cachedQueries) {
      if (!data) continue
      const queryState = queryKey[1] as 'open' | 'closed' | 'all' | undefined
      const without = data.filter((r) => r.number !== updated.number)
      const shouldInclude = queryState === 'all' || queryState === updated.state
      queryClient.setQueryData<BetaReport[]>(queryKey, shouldInclude ? [updated, ...without] : without)
    }
  }

  const closeAsFixed = useMutation({
    mutationFn: () =>
      authedFetch({
        route: BETA_REPORTS_API_URLS.CLOSE(report.number),
        body: { labels: replaceStatusInLabels(report.labels, 'corrige') }
      }),
    onSuccess: upsertReportInCache
  })

  const closeAsWontFix = useMutation({
    mutationFn: () =>
      authedFetch({
        route: BETA_REPORTS_API_URLS.CLOSE(report.number),
        body: { labels: replaceStatusInLabels(report.labels, 'ignore') }
      }),
    onSuccess: upsertReportInCache
  })

  const reopenAsNew = useMutation({
    mutationFn: () =>
      authedFetch({
        route: BETA_REPORTS_API_URLS.REOPEN(report.number),
        // No status label on reopen — drops back to the implicit untriaged state.
        body: { labels: stripStatusLabels(report.labels) }
      }),
    onSuccess: upsertReportInCache
  })

  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold">
          #{report.number} — {report.title}
        </h2>
      </div>

      <div className="flex flex-row gap-2 flex-wrap">
        {status && <span className="badge">{STATUS_DISPLAY[status]}</span>}
        {category && <span className="badge badge-outline">{CATEGORY_DISPLAY[category]}</span>}
        {severity && <span className="badge badge-outline">{SEVERITY_DISPLAY[severity]}</span>}
      </div>

      <div className="flex items-center gap-2">
        <div className="avatar w-7">
          <img className="rounded-full" src={report.user.avatar_url} alt="" />
        </div>
        <p className="text-sm opacity-70">par {report.user.login}</p>
      </div>

      {report.linkedLine && (
        <div className="bg-base-200 p-3 rounded-md">
          <p className="text-sm font-semibold opacity-70">Ligne associée</p>
          <p className="font-mono text-sm">
            {report.linkedLine.filePath}:{report.linkedLine.lineNumber}
          </p>
        </div>
      )}

      {description && (
        <div>
          <p className="text-sm font-semibold opacity-70 mb-1">Description</p>
          <p className="whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {screenshotUrls.length > 0 && (
        <div>
          <p className="text-sm font-semibold opacity-70 mb-1">
            {screenshotUrls.length > 1 ? "Captures d'écran" : "Capture d'écran"}
          </p>
          <div className="flex flex-col gap-2">
            {screenshotUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="rounded-md max-w-full max-h-[450px] object-contain border border-base-200"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-row gap-2 flex-wrap mt-4 sticky bottom-0 bg-base-100 py-2">
        {report.state === 'open' && (
          <>
            <button
              className="btn btn-success"
              disabled={closeAsFixed.isPending}
              onClick={() => closeAsFixed.mutate()}
            >
              Confirmer la correction
            </button>
            <button
              className="btn btn-ghost"
              disabled={closeAsWontFix.isPending}
              onClick={() => closeAsWontFix.mutate()}
            >
              Ne sera pas corrigé
            </button>
          </>
        )}
        {report.state === 'closed' && (
          <button className="btn btn-warning" disabled={reopenAsNew.isPending} onClick={() => reopenAsNew.mutate()}>
            Toujours problématique
          </button>
        )}
      </div>
    </div>
  )
}
