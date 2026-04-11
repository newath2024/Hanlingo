-- CreateEnum
CREATE TYPE "AttemptSourceContext" AS ENUM ('lesson', 'practice_mixed', 'practice_errors');

-- CreateTable
CREATE TABLE "UserQuestionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "sourceContext" "AttemptSourceContext" NOT NULL,
    "wasCorrect" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserQuestionAttempt_userId_createdAt_idx" ON "UserQuestionAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserQuestionAttempt_userId_questionId_createdAt_idx" ON "UserQuestionAttempt"("userId", "questionId", "createdAt");

-- CreateIndex
CREATE INDEX "UserQuestionAttempt_userId_lessonId_createdAt_idx" ON "UserQuestionAttempt"("userId", "lessonId", "createdAt");

-- CreateIndex
CREATE INDEX "UserQuestionAttempt_userId_unitId_createdAt_idx" ON "UserQuestionAttempt"("userId", "unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserQuestionAttempt" ADD CONSTRAINT "UserQuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
