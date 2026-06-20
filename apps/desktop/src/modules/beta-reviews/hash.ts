/**
 * Client mirror of the backend's Beta QA line-identity hash.
 *
 * A line's identity is its (VO, VF) content — exact bytes, no normalisation, whitespace significant.
 * The marks table on the server is keyed by this hash; the server computes it on the WRITE path
 * (mark/unmark), and the client computes it here on the READ path to map per-hash counts back onto
 * the lines it displays. A hash with no mark means the line is unreviewed.
 *
 * MUST stay byte-for-byte identical to the backend recipe in
 * apps/server/src/beta-reviews/beta-reviews.service.ts (`hashLine`). If you change it, change both
 * sides and bump the "v1:" version so old and new marks don't silently merge.
 */

const encoder = new TextEncoder()

const byteLength = (text: string) => encoder.encode(text).length

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/** Versioned, length-prefixed SHA-256 of (VO, VF). Returns e.g. "v1:ab12…". */
export const hashBetaLine = async (original: string, translated: string): Promise<string> => {
  const payload = `${byteLength(original)}:${original}\n${byteLength(translated)}:${translated}`
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(payload))
  return 'v1:' + toHex(digest)
}
