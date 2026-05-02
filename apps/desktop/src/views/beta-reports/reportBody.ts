import { ENV } from '../../Env'

// The issue body is built by the backend as:
//   <description>\n\n
//   ![screenshot](<backend-proxy-url>)\n\n     (one block per screenshot)
//   [BETA_REPORT_LINE]{...}[/BETA_REPORT_LINE]   (optional)
//
// The screenshot URL is the absolute backend proxy URL so the image renders both in the
// app and on github.com. (A private-repo `download_url` from GitHub itself can't be used —
// it expires after a few minutes.)
const SCREENSHOT_REGEX = /!\[screenshot\]\((.+?)\)/g

const pathToProxyUrl = (path: string) =>
  `${ENV.TRANSLATION_API_BASE_URL}/beta-reports/screenshots/file?path=${encodeURIComponent(path)}`

export const extractScreenshotUrls = (body: string | null | undefined): string[] => {
  if (!body) return []
  return Array.from(body.matchAll(SCREENSHOT_REGEX), (m) => {
    const value = m[1]
    // Backward compat: very early reports stored just the GitHub path. Convert those.
    return /^https?:\/\//.test(value) ? value : pathToProxyUrl(value)
  })
}

export const extractDescription = (body: string | null | undefined): string | null => {
  if (!body) return null
  // Strip every screenshot markdown block and the BETA_REPORT_LINE marker, then trim.
  const withoutScreenshots = body.replace(SCREENSHOT_REGEX, '')
  const withoutMarker = withoutScreenshots.replace(/\[BETA_REPORT_LINE\][\s\S]*?\[\/BETA_REPORT_LINE\]/g, '')
  const trimmed = withoutMarker.trim()
  return trimmed.length > 0 ? trimmed : null
}
