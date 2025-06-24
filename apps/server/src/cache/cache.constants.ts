export const CACHE_KEYS = {
  FILES: (branch: string) => `files-${branch}`,
  COMMENTS: (pullRequestNumber: number) => `comments-${pullRequestNumber}`,
  PROGRESSION: 'progression'
} as const
