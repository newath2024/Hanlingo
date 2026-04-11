-- CreateEnum
CREATE TYPE "FingerprintType" AS ENUM (
    'WORD_CONFUSION',
    'GRAMMAR_MISMATCH',
    'RANDOM_GUESS',
    'LISTENING_MISHEAR',
    'ORDERING_BREAKDOWN'
);

-- CreateTable
CREATE TABLE "UserErrorFingerprint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "exerciseType" TEXT NOT NULL,
    "fingerprintType" "FingerprintType" NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "userAnswerRaw" TEXT NOT NULL,
    "correctAnswerRaw" TEXT NOT NULL,
    "analysisPayload" JSONB NOT NULL,
    "responseTimeMs" INTEGER,
    "priorAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserErrorFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserErrorFingerprint_userId_createdAt_idx" ON "UserErrorFingerprint"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserErrorFingerprint_userId_questionId_createdAt_idx" ON "UserErrorFingerprint"("userId", "questionId", "createdAt");

-- CreateIndex
CREATE INDEX "UserErrorFingerprint_userId_fingerprintType_createdAt_idx" ON "UserErrorFingerprint"("userId", "fingerprintType", "createdAt");

-- AddForeignKey
ALTER TABLE "UserErrorFingerprint" ADD CONSTRAINT "UserErrorFingerprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
