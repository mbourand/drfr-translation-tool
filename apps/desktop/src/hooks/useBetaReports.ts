import { useQuery } from '@tanstack/react-query'
import { authedFetch } from '../modules/fetching/fetcher'
import { BETA_REPORTS_API_URLS } from '../routes/beta-reports/routes'

export const useBetaReports = (state: 'open' | 'closed' | 'all' = 'open') => {
  return useQuery({
    queryKey: ['beta-reports', state],
    queryFn: () => authedFetch({ route: BETA_REPORTS_API_URLS.LIST(state) })
  })
}
