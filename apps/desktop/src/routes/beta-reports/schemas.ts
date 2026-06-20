import { z } from 'zod'

export const CATEGORY_KEYS = ['orthographe', 'erreur-de-traduction', 'oubli-de-traduction', 'bug-crash', 'subjectif'] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export const SEVERITY_KEYS = ['minor', 'major', 'blocker'] as const
export type SeverityKey = (typeof SEVERITY_KEYS)[number]

export const STATUS_KEYS = ['pris-en-compte', 'a-retester', 'corrige', 'ignore'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

export const CATEGORY_LABEL_TO_KEY: Record<string, CategoryKey> = {
  'cat:orthographe': 'orthographe',
  'cat:erreur-de-traduction': 'erreur-de-traduction',
  'cat:oubli-de-traduction': 'oubli-de-traduction',
  'cat:bug-crash': 'bug-crash',
  'cat:subjectif': 'subjectif'
}

export const SEVERITY_LABEL_TO_KEY: Record<string, SeverityKey> = {
  'sev:mineure': 'minor',
  'sev:majeure': 'major',
  'sev:bloquante': 'blocker'
}

export const STATUS_LABEL_TO_KEY: Record<string, StatusKey> = {
  'status:pris-en-compte': 'pris-en-compte',
  'status:a-retester': 'a-retester',
  'status:corrige': 'corrige',
  'status:ignore': 'ignore'
}

export const CATEGORY_KEY_TO_LABEL: Record<CategoryKey, string> = {
  orthographe: 'cat:orthographe',
  'erreur-de-traduction': 'cat:erreur-de-traduction',
  'oubli-de-traduction': 'cat:oubli-de-traduction',
  'bug-crash': 'cat:bug-crash',
  subjectif: 'cat:subjectif'
}

export const SEVERITY_KEY_TO_LABEL: Record<SeverityKey, string> = {
  minor: 'sev:mineure',
  major: 'sev:majeure',
  blocker: 'sev:bloquante'
}

export const STATUS_KEY_TO_LABEL: Record<StatusKey, string> = {
  'pris-en-compte': 'status:pris-en-compte',
  'a-retester': 'status:a-retester',
  corrige: 'status:corrige',
  ignore: 'status:ignore'
}

export const CATEGORY_DISPLAY: Record<CategoryKey, string> = {
  orthographe: 'Orthographe',
  'erreur-de-traduction': 'Erreur de traduction',
  'oubli-de-traduction': 'Oubli de traduction',
  'bug-crash': 'Bug / Crash',
  subjectif: 'Subjectif'
}

export const SEVERITY_DISPLAY: Record<SeverityKey, string> = {
  minor: 'Mineure',
  major: 'Majeure',
  blocker: 'Bloquante'
}

export const STATUS_DISPLAY: Record<StatusKey, string> = {
  'pris-en-compte': 'Pris en compte',
  'a-retester': 'À retester',
  corrige: 'Corrigé',
  ignore: 'Ignoré'
}

export const BetaReportLineSchema = z.object({
  filePath: z.string(),
  lineNumber: z.number().int()
})

export const BetaReportSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullish(),
    state: z.enum(['open', 'closed']),
    user: z.object({ login: z.string(), avatar_url: z.string() }).passthrough(),
    labels: z.array(z.object({ name: z.string() }).passthrough()),
    html_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    linkedLine: BetaReportLineSchema.nullish()
  })
  .passthrough()

export type BetaReport = z.infer<typeof BetaReportSchema>
