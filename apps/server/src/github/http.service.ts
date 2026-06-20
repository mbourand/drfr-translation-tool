import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { CACHE_KEYS } from 'src/cache/cache.constants'

type ConditionalEntry<T> = { etag: string; body: T }

// 7 days. Bounds RAM growth without throwing away entries that are still actively queried —
// any URL hit within a week stays cached; cold ones get evicted.
const CONDITIONAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class GithubHttpService {
  private readonly logger = new Logger(GithubHttpService.name)

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  public async fetch(url: string, options?: { authorization?: string; body?: Record<string, any>; method?: string }) {
    const response = await fetch(url, {
      method: options?.method || 'GET',
      body: options?.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options?.authorization ? { Authorization: options.authorization } : {})
      }
    })

    return response
  }

  /**
   * GET a GitHub URL with ETag-based conditional caching. On a 304 response from GitHub
   * the cached body is returned without counting against the rate limit. On 200, the
   * fresh body and ETag are stored.
   *
   * Use only for idempotent GET requests where the JSON body is the only thing we care
   * about (response headers like Link/pagination are not surfaced to the caller).
   */
  public async cachedGet<T>(url: string, options: { authorization?: string }): Promise<T> {
    const cacheKey = CACHE_KEYS.CONDITIONAL(url)
    const cached = await this.cacheManager.get<ConditionalEntry<T>>(cacheKey)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.authorization ? { Authorization: options.authorization } : {}),
        ...(cached?.etag ? { 'If-None-Match': cached.etag } : {})
      }
    })

    if (response.status === 304 && cached) {
      this.logger.debug(`ETag hit (304) for ${url}`)
      return cached.body
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>')
      this.logger.error(`GitHub ${response.status} ${response.statusText} on ${url} :: ${errorBody}`)
      throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${url} :: ${errorBody}`)
    }

    const body = (await response.json()) as T
    const etag = response.headers.get('ETag')
    if (etag) {
      await this.cacheManager.set(cacheKey, { etag, body } satisfies ConditionalEntry<T>, CONDITIONAL_CACHE_TTL_MS)
    }
    return body
  }

  /**
   * Drop the conditional cache entry for a URL so the next `cachedGet` sends a fresh request
   * (no If-None-Match) and gets a 200. Use this from write endpoints that mutate data the
   * cached URL surfaces — GitHub's ETag isn't always bumped instantly after a write, and a
   * stale 304 would otherwise return the pre-write body.
   */
  public async invalidateCachedGet(url: string): Promise<void> {
    await this.cacheManager.del(CACHE_KEYS.CONDITIONAL(url))
  }
}
