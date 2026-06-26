import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { EnvironmentVariables } from '@/env'

/** The only field of a Multer-parsed upload this pipeline reads (memory storage, so bytes are in `buffer`). */
export type UploadedImage = { buffer: Buffer }

/** Long edge (px) every stored screenshot is bounded to. Images already smaller are never upscaled. */
const MAX_LONG_EDGE_PX = 1600
/** WebP quality for stored screenshots — high enough to stay legible, low enough to keep files ~150–300 KB. */
const WEBP_QUALITY = 80

/**
 * The only writer to screenshot storage. Owns the full processing pipeline (decode → downscale to a
 * 1600px long edge without upscaling → WebP@80 with metadata stripped) and the `pr-<n>/<uuid>.webp`
 * key scheme, so callers hand over raw image bytes and get back the public URLs to embed. The storage
 * root and public base URL are the only seam to the environment; everything else is internal.
 */
@Injectable()
export class ScreenshotsService {
  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  /**
   * Process and persist each image under `<SCREENSHOTS_DIR>/pr-<pullRequestNumber>/<uuid>.webp`, returning
   * the public URL of every stored file in input order. A blob `sharp` cannot decode is treated as a
   * client validation failure (400) — nothing is posted — rather than a server error.
   */
  async store(pullRequestNumber: number, files: UploadedImage[]): Promise<string[]> {
    if (files.length === 0) return []

    const dir = this.configService.getOrThrow('SCREENSHOTS_DIR', { infer: true })
    const baseUrl = this.configService.getOrThrow('SCREENSHOTS_PUBLIC_BASE_URL', { infer: true }).replace(/\/+$/, '')
    const prefix = `pr-${pullRequestNumber}`
    const prDir = join(dir, prefix)

    await mkdir(prDir, { recursive: true })

    const urls: string[] = []
    for (const file of files) {
      let webp: Buffer
      try {
        webp = await sharp(file.buffer)
          .resize({ width: MAX_LONG_EDGE_PX, height: MAX_LONG_EDGE_PX, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()
      } catch {
        throw new BadRequestException('Attached file is not a valid image')
      }

      const filename = `${randomUUID()}.webp`
      await writeFile(join(prDir, filename), webp)
      urls.push(`${baseUrl}/screenshots/${prefix}/${filename}`)
    }

    return urls
  }
}
