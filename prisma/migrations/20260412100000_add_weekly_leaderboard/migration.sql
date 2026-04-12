-- CreateEnum
CREATE TYPE "LeaderboardLeague" AS ENUM (
    'bronze',
    'silver',
    'gold',
    'sapphire',
    'ruby',
    'emerald',
    'amethyst',
    'pearl',
    'obsidian',
    'diamond'
);

-- CreateEnum
CREATE TYPE "LeaderboardWeekStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "LeaderboardActivitySourceType" AS ENUM ('lesson', 'practice', 'review', 'bonus');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "currentLeague" "LeaderboardLeague" NOT NULL DEFAULT 'bronze';

-- CreateTable
CREATE TABLE "LeaderboardWeek" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "LeaderboardWeekStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardGroup" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "league" "LeaderboardLeague" NOT NULL,
    "groupNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "league" "LeaderboardLeague" NOT NULL,
    "weeklyXp" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
    "practicesCompleted" INTEGER NOT NULL DEFAULT 0,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "demoted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardActivity" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "LeaderboardActivitySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "xpDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardWeek_key_key" ON "LeaderboardWeek"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardGroup_weekId_league_groupNumber_key" ON "LeaderboardGroup"("weekId", "league", "groupNumber");

-- CreateIndex
CREATE INDEX "LeaderboardGroup_weekId_league_idx" ON "LeaderboardGroup"("weekId", "league");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_weekId_userId_key" ON "LeaderboardEntry"("weekId", "userId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_groupId_weeklyXp_updatedAt_idx" ON "LeaderboardEntry"("groupId", "weeklyXp", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardActivity_userId_sourceType_sourceId_key" ON "LeaderboardActivity"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "LeaderboardActivity_entryId_createdAt_idx" ON "LeaderboardActivity"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaderboardGroup" ADD CONSTRAINT "LeaderboardGroup_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "LeaderboardWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "LeaderboardWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LeaderboardGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardActivity" ADD CONSTRAINT "LeaderboardActivity_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LeaderboardEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardActivity" ADD CONSTRAINT "LeaderboardActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
