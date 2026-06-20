-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "BetaReviewMark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaReviewMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetaReviewMark_filePath_contentHash_idx" ON "BetaReviewMark"("filePath", "contentHash");

-- CreateIndex
CREATE INDEX "BetaReviewMark_filePath_userId_idx" ON "BetaReviewMark"("filePath", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BetaReviewMark_userId_filePath_contentHash_key" ON "BetaReviewMark"("userId", "filePath", "contentHash");

