-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('OK', 'KO');

-- AlterTable
-- Existing rows were recorded under the old binary "verified, looks fine" meaning, so they
-- backfill to OK via the column default (applied to every existing row by ADD COLUMN ... NOT NULL DEFAULT).
ALTER TABLE "BetaReviewMark" ADD COLUMN "verdict" "Verdict" NOT NULL DEFAULT 'OK';
