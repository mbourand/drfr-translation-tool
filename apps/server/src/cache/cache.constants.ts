export const CACHE_KEYS = {
  FILES: (branch: string) => `files-${branch}`,
  COMMENTS: (pullRequestNumber: number) => `comments-${pullRequestNumber}`
} as const
