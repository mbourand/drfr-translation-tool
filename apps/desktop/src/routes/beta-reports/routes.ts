import { z } from 'zod'
import { ENV } from '../../Env'
import { BetaReportSchema } from './schemas'

export const BETA_REPORTS_API_URLS = {
  LIST: (state: 'open' | 'closed' | 'all' = 'open') =>
    ({
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports?state=${state}`,
      method: 'GET',
      responseSchema: BetaReportSchema.array()
    } as const),
  CREATE: {
    url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports`,
    method: 'POST',
    bodySchema: z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(8000).optional(),
      category: z.enum(['orthographe', 'erreur-de-traduction', 'oubli-de-traduction', 'bug-crash', 'subjectif']),
      severity: z.enum(['minor', 'major', 'blocker']),
      screenshots: z.array(z.object({ name: z.string(), base64: z.string() })).min(1),
      line: z.object({ filePath: z.string(), lineNumber: z.number().int() }).optional()
    }),
    responseSchema: BetaReportSchema
  },
  SET_LABELS: (issueNumber: number) =>
    ({
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports/${issueNumber}/labels`,
      method: 'PATCH',
      bodySchema: z.object({ labels: z.array(z.string()) }),
      responseSchema: BetaReportSchema
    } as const),
  CLOSE: (issueNumber: number) =>
    ({
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports/${issueNumber}/close`,
      method: 'POST',
      bodySchema: z.object({ labels: z.array(z.string()) }),
      responseSchema: BetaReportSchema
    } as const),
  REOPEN: (issueNumber: number) =>
    ({
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports/${issueNumber}/reopen`,
      method: 'POST',
      bodySchema: z.object({ labels: z.array(z.string()) }),
      responseSchema: BetaReportSchema
    } as const),
  IMPACTS: {
    url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reports/impacts`,
    method: 'POST',
    bodySchema: z.object({ branch: z.string() }),
    responseSchema: z.array(z.number())
  }
} as const
