import {
  CategoryKey,
  CATEGORY_LABEL_TO_KEY,
  SeverityKey,
  SEVERITY_LABEL_TO_KEY,
  StatusKey,
  STATUS_LABEL_TO_KEY,
  BetaReport
} from '../../routes/beta-reports/schemas'

export const getReportCategory = (report: BetaReport): CategoryKey | null => {
  for (const label of report.labels) {
    const key = CATEGORY_LABEL_TO_KEY[label.name]
    if (key) return key
  }
  return null
}

export const getReportSeverity = (report: BetaReport): SeverityKey | null => {
  for (const label of report.labels) {
    const key = SEVERITY_LABEL_TO_KEY[label.name]
    if (key) return key
  }
  return null
}

export const getReportStatus = (report: BetaReport): StatusKey | null => {
  for (const label of report.labels) {
    const key = STATUS_LABEL_TO_KEY[label.name]
    if (key) return key
  }
  return null
}
