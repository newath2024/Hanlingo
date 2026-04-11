-- CreateEnum
CREATE TYPE "ErrorType" AS ENUM ('vocab', 'grammar', 'listening', 'speaking');

-- CreateTable
CREATE TABLE "UserError" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "errorType" "ErrorType" NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserError_userId_questionId_key" ON "UserError"("userId", "questionId");

-- CreateIndex
CREATE INDEX "UserError_userId_nextReviewAt_idx" ON "UserError"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "UserError_userId_errorCount_lastSeenAt_idx" ON "UserError"("userId", "errorCount", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "UserError" ADD CONSTRAINT "UserError_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
