import { z } from 'zod'
import { ENV } from '../../Env'
import { ConfirmAuthResponseSchema, TranslationSchema, UserSchema } from './schemas'

export const TRANSLATION_API_URLS = {
  AUTH: {
    CONFIRM: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/auth/confirm`,
      responseSchema: ConfirmAuthResponseSchema,
      method: 'POST',
      bodySchema: z.object({ code: z.string() })
    },
    USER: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/auth/user`,
      responseSchema: UserSchema,
      method: 'GET'
    }
  },
  TRANSLATIONS: {
    LIST: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/list`,
      method: 'GET',
      responseSchema: TranslationSchema.array()
    },
    CREATE: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation`,
      method: 'POST',
      bodySchema: z.object({ name: z.string() }),
      responseSchema: TranslationSchema
    },
    SUBMIT_TO_REVIEW: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/submit-to-review`,
      method: 'POST',
      bodySchema: z.object({ branch: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    APPROVE: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/approve`,
      method: 'POST',
      bodySchema: z.object({ branch: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    MARK_AS_REVIEWED: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/mark-as-reviewed`,
      method: 'POST',
      bodySchema: z.object({ branch: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    QA_APPROVE: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/qa-approve`,
      method: 'POST',
      bodySchema: z.object({ branch: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    QA_REQUEST_CHANGES: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/qa-request-changes`,
      method: 'POST',
      bodySchema: z.object({ branch: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    FILES: (branch: string) =>
      ({
        url: `${ENV.TRANSLATION_API_BASE_URL}/translation/files?branch=${branch}`,
        method: 'GET',
        responseSchema: z
          .object({
            original: z.string(),
            translated: z.string(),
            name: z.string(),
            category: z.string(),
            originalPath: z.string(),
            translatedPath: z.string(),
            pathInGameFolder: z.string()
          })
          .array()
      } as const),
    FILES_AT_BRANCH_CREATION: (branch: string) =>
      ({
        url: `${ENV.TRANSLATION_API_BASE_URL}/translation/files-at-branch-creation?branch=${branch}`,
        method: 'GET',
        responseSchema: z
          .object({
            original: z.string(),
            translated: z.string(),
            name: z.string(),
            category: z.string(),
            originalPath: z.string(),
            translatedPath: z.string(),
            pathInGameFolder: z.string()
          })
          .array()
      } as const),
    SAVE_FILES: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/files`,
      method: 'POST',
      responseSchema: z.object({ success: z.boolean() }),
      bodySchema: z.object({
        branch: z.string(),
        message: z.string(),
        files: z.array(
          z.object({
            path: z.string(),
            content: z.string()
          })
        )
      })
    },
    LIST_COMMENTS: (branch: string) =>
      ({
        url: `${ENV.TRANSLATION_API_BASE_URL}/translation/comments?branch=${branch}`,
        method: 'GET',
        responseSchema: z
          .object({
            subject_type: z.string(),
            path: z.string(),
            line: z.number(),
            user: z.object({ login: z.string(), avatar_url: z.string() }),
            body: z.string(),
            id: z.number(),
            pull_request_url: z.string()
          })
          .passthrough()
          .array()
      } as const),
    ADD_COMMENT: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/comment`,
      method: 'POST',
      encoding: 'multipart',
      bodySchema: z.object({
        branch: z.string(),
        line: z.number(),
        body: z.string(),
        filePath: z.string(),
        inReplyTo: z.number().optional(),
        // Optional attached screenshot, sent as a multipart file part; the backend re-encodes and embeds it.
        screenshot: z.instanceof(Blob).optional()
      }),
      responseSchema: z.object({
        success: z.boolean()
      })
    },
    DELETE_COMMENT: (commentId: number, pullRequestNumber: number) =>
      ({
        url: `${ENV.TRANSLATION_API_BASE_URL}/translation/comment?commentId=${commentId}&pullRequestNumber=${pullRequestNumber}`,
        method: 'DELETE',
        responseSchema: z.object({
          success: z.boolean()
        })
      } as const),
    UPDATE_IMPACTS: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/translation/impacts`,
      method: 'PATCH',
      bodySchema: z.object({
        branch: z.string(),
        auto: z.array(z.number()).optional(),
        manual_include: z.array(z.number()).optional(),
        manual_exclude: z.array(z.number()).optional()
      }),
      responseSchema: z.object({
        success: z.boolean(),
        impacts: z.object({
          auto: z.array(z.number()),
          manual_include: z.array(z.number()),
          manual_exclude: z.array(z.number())
        })
      })
    }
  },
  BETA_REVIEWS: {
    // Distinct-QA OK/KO tallies for the `beta` file, one entry per (contentHash) that has at least one
    // verdict. Hashes with no verdict are absent — the client treats a missing line hash as non relu.
    COUNTS: (filePath: string) =>
      ({
        url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reviews/counts?filePath=${encodeURIComponent(filePath)}`,
        method: 'GET',
        responseSchema: z
          .object({
            contentHash: z.string(),
            okCount: z.number(),
            koCount: z.number(),
            myVerdict: z.enum(['OK', 'KO']).nullable()
          })
          .array()
      } as const),
    // Set/replace the caller's own verdict on a line (OK<->KO flip overwrites in place).
    SET_VERDICT: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reviews/marks`,
      method: 'POST',
      bodySchema: z.object({
        filePath: z.string(),
        original: z.string(),
        translated: z.string(),
        verdict: z.enum(['OK', 'KO'])
      }),
      responseSchema: z.object({ success: z.boolean() })
    },
    // Clear only the caller's own verdict on a line (misclick / unread recovery).
    CLEAR_MINE: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reviews/marks`,
      method: 'DELETE',
      bodySchema: z.object({ filePath: z.string(), original: z.string(), translated: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    },
    // Line-level KO clear: removes EVERY QA's KO on the line (any caller, no authorship check).
    CLEAR_KO: {
      url: `${ENV.TRANSLATION_API_BASE_URL}/beta-reviews/marks/ko`,
      method: 'DELETE',
      bodySchema: z.object({ filePath: z.string(), original: z.string(), translated: z.string() }),
      responseSchema: z.object({ success: z.boolean() })
    }
  }
} as const
