import { fetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'
import { path } from '@tauri-apps/api'
import { remove, writeFile } from '@tauri-apps/plugin-fs'
import { store, STORE_KEYS, StoreUserInfos } from '../../store/store'
import { RUST_COMMANDS } from '../commands/commands'

// The private patcher repo. Its content (assets + `.csx` scripts) is downloaded per-branch as a zip
// instead of being cloned with system git — no git binary, no manual clone, no folder pick.
const PATCHER_REPO = 'mbourand/deltarune-fr'

// GitHub rejects API requests without a User-Agent (403), and pinning the API version keeps the
// response shape stable. Shared by the cheap head-SHA check and the zip download below.
const githubHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'User-Agent': 'drfr-translation-tool',
  'X-GitHub-Api-Version': '2022-11-28'
})

/**
 * The GitHub session expired (401) while syncing. The caller routes this through the existing
 * re-login flow rather than surfacing it as a generic error; the sync resumes once re-authenticated.
 */
export class SyncAuthError extends Error {
  constructor() {
    super('GitHub authentication expired')
    this.name = 'SyncAuthError'
  }
}

/**
 * First-time setup with no internet and no local copy to fall back on — the one unavoidable hard
 * stop. Carries a user-facing French message explaining a connection is required to get started.
 */
export class FirstTimeSetupError extends Error {
  constructor() {
    super('Une connexion Internet est requise pour la configuration initiale.')
    this.name = 'FirstTimeSetupError'
  }
}

export type SyncStatus =
  | 'downloaded' // the branch moved (or first run) → fresh content was fetched and swapped in
  | 'skipped' // the stored SHA already matched the remote head → nothing to download
  | 'offline-fallback' // the check/download failed but a last-good copy exists → launching from it

export type EnsureBranchSyncedResult = {
  gitFolder: string
  status: SyncStatus
}

const requireAccessToken = async (): Promise<string> => {
  const userInfos = await store.get<StoreUserInfos>(STORE_KEYS.USER_INFOS)
  if (!userInfos) throw new SyncAuthError()
  return userInfos.accessToken
}

/**
 * Cheap freshness probe: ask GitHub for the branch's current head-SHA only (the `.sha` media type
 * returns just the commit hash as text, not the full commit object). A 401 means the token expired
 * and is surfaced as `SyncAuthError`; any other failure throws and the caller decides whether to
 * fall back to a local copy.
 */
const fetchRemoteHeadSha = async (branch: string): Promise<string> => {
  const accessToken = await requireAccessToken()

  const response = await fetch(`https://api.github.com/repos/${PATCHER_REPO}/commits/${branch}`, {
    method: 'GET',
    headers: { ...githubHeaders(accessToken), Accept: 'application/vnd.github.sha' }
  })

  if (response.status === 401) throw new SyncAuthError()
  if (!response.ok) {
    throw new Error(`Failed to check ${branch} head: ${response.status} ${response.statusText}`)
  }

  const sha = (await response.text()).trim()
  if (!sha) throw new Error(`Empty head SHA returned for ${branch}`)
  return sha
}

/**
 * Download a branch's full repo content from GitHub as a zip — authenticated with the user's stored
 * GitHub token, the same one the server uses to commit on their behalf, so it can read the private
 * repo — and hand it to Rust, which extracts it (stripping GitHub's top-level wrapper folder),
 * atomically swaps it into the app-managed `patcher/<branch>/` location, and persists `headSha` only
 * after that swap fully succeeds. Returns that local path, which the launcher uses as its git root.
 */
export const syncBranch = async (branch: string, headSha: string): Promise<string> => {
  const accessToken = await requireAccessToken()

  // GitHub redirects the zipball request to codeload; the HTTP client follows it automatically.
  const response = await fetch(`https://api.github.com/repos/${PATCHER_REPO}/zipball/${branch}`, {
    method: 'GET',
    headers: githubHeaders(accessToken)
  })

  if (response.status === 401) throw new SyncAuthError()
  if (!response.ok) {
    throw new Error(`Failed to download ${branch} content: ${response.status} ${response.statusText}`)
  }

  const archive = new Uint8Array(await response.arrayBuffer())
  const zipPath = await path.join(await path.tempDir(), `drfr-${branch}.zip`)
  await writeFile(zipPath, archive)

  try {
    return await invoke<string>(RUST_COMMANDS.SYNC_BRANCH_FROM_ZIP, { branch, zipPath, headSha })
  } finally {
    await remove(zipPath).catch(() => {})
  }
}

type EnsureBranchSyncedOptions = {
  // Force-refresh: re-download regardless of the stored SHA (the manual "update" escape hatch).
  force?: boolean
}

/**
 * Make a branch's local content fresh, cheaply and resiliently, before a play-test:
 *
 * - SHA-gated: a cheap head-SHA check skips the download when the branch hasn't moved (unless forced).
 * - Fail-soft: if the check or download fails but a last-good local copy exists, launch from it and
 *   report `offline-fallback` instead of blocking.
 * - Re-login: an expired token surfaces as `SyncAuthError` so the caller can route to re-login.
 * - Hard-stop: only the genuinely unrecoverable case — first run, no local copy, no network — throws
 *   `FirstTimeSetupError`.
 *
 * Returns the branch's local folder (the launcher's git root) plus what happened, so callers can show
 * an appropriate notice.
 */
export const ensureBranchSynced = async (
  branch: string,
  { force = false }: EnsureBranchSyncedOptions = {}
): Promise<EnsureBranchSyncedResult> => {
  const localDir = await invoke<string | null>(RUST_COMMANDS.BRANCH_LOCAL_DIR, { branch })

  let remoteSha: string
  try {
    remoteSha = await fetchRemoteHeadSha(branch)
  } catch (error) {
    if (error instanceof SyncAuthError) throw error
    // The check itself failed (offline/flaky). Fall back to a last-good copy if there is one; the
    // stored SHA is untouched, so the next launch re-checks and retries automatically.
    if (localDir) return { gitFolder: localDir, status: 'offline-fallback' }
    throw new FirstTimeSetupError()
  }

  const needsSync =
    force || !localDir || (await invoke<boolean>(RUST_COMMANDS.BRANCH_NEEDS_SYNC, { branch, remoteSha }))
  if (!needsSync) return { gitFolder: localDir as string, status: 'skipped' }

  try {
    const gitFolder = await syncBranch(branch, remoteSha)
    return { gitFolder, status: 'downloaded' }
  } catch (error) {
    if (error instanceof SyncAuthError) throw error
    // Download failed. A failed download never persisted the new SHA, so the next launch retries.
    if (localDir) return { gitFolder: localDir, status: 'offline-fallback' }
    throw new FirstTimeSetupError()
  }
}
