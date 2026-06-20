import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { authedFetch } from '../modules/fetching/fetcher'
import { BETA_REPORTS_API_URLS } from '../routes/beta-reports/routes'
import { BetaReport } from '../routes/beta-reports/schemas'

type CreateBetaReportBody = z.infer<typeof BETA_REPORTS_API_URLS.CREATE.bodySchema>

export const useCreateBetaReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateBetaReportBody) => authedFetch({ route: BETA_REPORTS_API_URLS.CREATE, body }),
    onSuccess: (newReport: BetaReport) => {
      // Apply the authoritative POST response to every cached open/all list. We don't
      // invalidate: empirically, GitHub's filtered list endpoint `?labels=beta-report`
      // returns a 304 (unchanged) for a few seconds after a create — even though the
      // issue is already in the repo with the label applied (we set labels atomically in
      // the POST body). GitHub appears to serve the filtered list through an async index
      // that lags behind the primary store. Refetching in that window clobbers this update.
      queryClient.setQueriesData<BetaReport[]>(
        {
          predicate: (query) => {
            const [root, state] = query.queryKey
            return root === 'beta-reports' && (state === 'open' || state === 'all')
          }
        },
        (old) => (old ? [newReport, ...old] : old)
      )
    }
  })
}
