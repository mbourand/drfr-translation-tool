/**
 * Dev-only seed: fills Beta QA verdicts for chapter 3's strings with random data from fake QA
 * accounts, so the Relecture de la beta grid can be viewed with verdicts that aren't your own.
 *
 * It fetches the beta-branch (VO, VF) exactly as the app does (GitHub contents API, raw media type),
 * splits and pairs lines the same way the desktop does, and computes each line's identity hash with
 * the same recipe as the server (apps/server/src/beta-reviews/beta-reviews.service.ts hashLine). So
 * the seeded contentHashes line up with what the client computes — the verdicts actually show up.
 *
 * The rows belong to synthetic users (`seed-qa-1`…`seed-qa-N`), never your GitHub id, so your own
 * verdict on every line stays "non relu" while the OK/KO counts and row tints come from "others".
 *
 * Run:    cd apps/server && npx ts-node prisma/seed-beta-ch3.ts
 * Auth:   uses your `gh auth token` to read the private repo.
 * Clean:  re-running replaces the seed (it deletes prior `seed-qa-*` rows for this file first);
 *         to remove entirely: DELETE FROM "BetaReviewMark" WHERE "userId" LIKE 'seed-qa-%';
 */
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient, Verdict } from '@prisma/client'

// --- config ---------------------------------------------------------------------------------------
const OWNER = process.env.REPOSITORY_OWNER ?? 'mbourand'
const NAME = process.env.REPOSITORY_NAME ?? 'deltarune-fr'
const BRANCH = process.env.REPOSITORY_BETA_BRANCH ?? 'beta'

const FILE_PATH = 'chapitre-3/strings_fr.txt' // the public (VF) key — what the grid stores as filePath
const ORIGINAL_PATH = 'chapitre-3/strings_en.txt' // the matching VO

const SEED_USER_PREFIX = 'seed-qa-'
const QA_POOL = Array.from({ length: 8 }, (_, i) => `${SEED_USER_PREFIX}${i + 1}`)
const TARGET_SEEDED_LINES = Number(process.env.SEED_LINES ?? 3000) // cap on distinct lines that get a verdict

// --- helpers --------------------------------------------------------------------------------------

// Load DATABASE_URL (and friends) from apps/server/.env so the script is self-sufficient.
const loadEnv = () => {
  try {
    for (const line of readFileSync(join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env optional if vars already set */
  }
}

const githubToken = () => execSync('gh auth token', { encoding: 'utf8' }).trim()

const fetchRaw = async (path: string, token: string): Promise<string> => {
  const url = `https://api.github.com/repos/${OWNER}/${NAME}/contents/${path}?ref=${BRANCH}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`
    }
  })
  if (!res.ok) throw new Error(`GitHub raw fetch failed: ${res.status} ${res.statusText} for ${path}`)
  return await res.text()
}

// Mirror of beta-reviews.service.ts hashLine — keep byte-for-byte identical.
const hashLine = (original: string, translated: string): string => {
  const payload = `${Buffer.byteLength(original)}:${original}\n${Buffer.byteLength(translated)}:${translated}`
  return 'v1:' + createHash('sha256').update(payload).digest('hex')
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const shuffle = <T>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
// Skew towards shallower review depth so the "≥ N×" ladder has a realistic taper.
const weightedDepth = () => {
  const r = Math.random()
  if (r < 0.5) return 1
  if (r < 0.8) return 2
  if (r < 0.95) return 3
  return 4
}

// --- main -----------------------------------------------------------------------------------------
const main = async () => {
  loadEnv()
  const prisma = new PrismaClient()
  try {
    const token = githubToken()
    console.log(`Fetching ${ORIGINAL_PATH} and ${FILE_PATH} from ${OWNER}/${NAME}@${BRANCH}…`)
    const [vo, vf] = await Promise.all([fetchRaw(ORIGINAL_PATH, token), fetchRaw(FILE_PATH, token)])

    // Pair lines exactly like the desktop (useTranslationFiles): split on '\n', index-wise, '' fill.
    const en = vo.split('\n')
    const fr = vf.split('\n')
    const lineCount = Math.max(en.length, fr.length)

    // Distinct, non-blank line identities (blank↔blank lines are skipped so a single empty hash
    // doesn't tint a flood of empty rows).
    const hashes = new Set<string>()
    for (let i = 0; i < lineCount; i++) {
      const original = en[i] ?? ''
      const translated = fr[i] ?? ''
      if (original === '' && translated === '') continue
      hashes.add(hashLine(original, translated))
    }

    const candidates = shuffle([...hashes]).slice(0, TARGET_SEEDED_LINES)
    console.log(`${lineCount} lines, ${hashes.size} distinct non-blank → seeding ${candidates.length}.`)

    const rows: { userId: string; filePath: string; contentHash: string; verdict: Verdict }[] = []
    let okLines = 0
    let koLines = 0
    let nonRelu = 0
    for (const contentHash of candidates) {
      const roll = Math.random()
      if (roll < 0.3) {
        nonRelu++ // ~30% stay non relu (no rows)
        continue
      }
      const isKo = roll > 0.85 // ~15% are KO lines
      const voters = shuffle(QA_POOL)
      if (isKo) {
        koLines++
        const koVoters = voters.slice(0, randInt(1, 2))
        koVoters.forEach((userId) => rows.push({ userId, filePath: FILE_PATH, contentHash, verdict: Verdict.KO }))
        // A KO line often also carries some "looks fine" OKs — demonstrates KO-prevails (OK count hidden).
        voters.slice(koVoters.length, koVoters.length + randInt(0, 2)).forEach((userId) =>
          rows.push({ userId, filePath: FILE_PATH, contentHash, verdict: Verdict.OK })
        )
      } else {
        okLines++
        voters
          .slice(0, weightedDepth())
          .forEach((userId) => rows.push({ userId, filePath: FILE_PATH, contentHash, verdict: Verdict.OK }))
      }
    }

    // Replace any previous seed for this file, then insert fresh.
    const removed = await prisma.betaReviewMark.deleteMany({
      where: { filePath: FILE_PATH, userId: { startsWith: SEED_USER_PREFIX } }
    })

    const BATCH = 5000
    for (let i = 0; i < rows.length; i += BATCH) {
      await prisma.betaReviewMark.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true })
    }

    console.log(
      `Done. Removed ${removed.count} prior seed rows, inserted ${rows.length} verdicts ` +
        `(${okLines} OK lines, ${koLines} KO lines, ${nonRelu} left non relu) across ${QA_POOL.length} fake QAs.`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
