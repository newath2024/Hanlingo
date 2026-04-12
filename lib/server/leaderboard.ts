import "server-only";

import {
  getDemotedLeague,
  getLeaderboardMovementCounts,
  getPromotedLeague,
  LEADERBOARD_TARGET_GROUP_SIZE,
  LEADERBOARD_WEEK_DURATION_MS,
  LEADERBOARD_XP_REWARDS,
} from "@/lib/constants/leaderboard";
import {
  createLeaderboardActivityIfMissing,
  createLeaderboardEntry,
  createLeaderboardGroup,
  createLeaderboardWeek,
  findActiveLeaderboardWeek,
  findLeaderboardEntryById,
  findLeaderboardEntryByWeekAndUser,
  findLeaderboardGroupById,
  findLeaderboardWeekById,
  findLeaderboardWeekByKey,
  findUserById,
  findUsersByIds,
  listLeaderboardEntriesByGroup,
  listLeaderboardEntriesByWeek,
  listLeaderboardGroupsByWeek,
  listLeaderboardGroupsByWeekAndLeague,
  updateLeaderboardEntry,
  updateLeaderboardWeek,
  updateUserCurrentLeague,
  type LeaderboardEntryRecord,
  type LeaderboardGroupRecord,
  type LeaderboardWeekRecord,
} from "@/lib/server/data-store";
import type {
  AwardLeaderboardXpInput,
  LeaderboardResponse,
  LeaderboardSummaryResponse,
  LeaderboardZoneStatus,
} from "@/types/leaderboard";

function getUtcWeekStart(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function getLeaderboardWeekWindow(date: Date) {
  const startsAt = getUtcWeekStart(date);
  const endsAt = new Date(startsAt.getTime() + LEADERBOARD_WEEK_DURATION_MS);

  return {
    key: startsAt.toISOString().slice(0, 10),
    startsAt,
    endsAt,
  };
}

function sortEntriesForRank(entries: LeaderboardEntryRecord[]) {
  return [...entries].sort((left, right) => {
    if (right.weeklyXp !== left.weeklyXp) {
      return right.weeklyXp - left.weeklyXp;
    }

    if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    }

    return left.userId.localeCompare(right.userId);
  });
}

function getDemotionMinRank(participantCount: number, demotionCount: number) {
  if (demotionCount <= 0 || participantCount <= 0) {
    return null;
  }

  return participantCount - demotionCount + 1;
}

function getZoneStatus(
  rank: number,
  participantCount: number,
): LeaderboardZoneStatus {
  const { promotionCount, demotionCount } = getLeaderboardMovementCounts(participantCount);
  const demotionMinRank = getDemotionMinRank(participantCount, demotionCount);

  if (promotionCount > 0 && rank <= promotionCount) {
    return "promotion";
  }

  if (demotionMinRank && rank >= demotionMinRank) {
    return "demotion";
  }

  return "safe";
}

export async function createNextLeaderboardWeek(
  referenceWeek?: LeaderboardWeekRecord | null,
  now = new Date(),
) {
  const baseDate =
    referenceWeek && now.getTime() < referenceWeek.endsAt.getTime()
      ? referenceWeek.endsAt
      : now;
  const weekWindow = getLeaderboardWeekWindow(baseDate);
  const existing = await findLeaderboardWeekByKey(weekWindow.key);

  if (existing?.status === "active") {
    return existing;
  }

  if (existing?.status === "closed") {
    return createNextLeaderboardWeek(null, weekWindow.endsAt);
  }

  const created = await createLeaderboardWeek({
    key: weekWindow.key,
    startsAt: weekWindow.startsAt,
    endsAt: weekWindow.endsAt,
    status: "active",
  });

  if (!created) {
    throw new Error("Unable to create the next leaderboard week.");
  }

  return created;
}

export async function finalizeLeaderboardWeek(
  weekId: string,
  options: { now?: Date } = {},
) {
  const week = await findLeaderboardWeekById(weekId);

  if (!week) {
    throw new Error("Leaderboard week not found.");
  }

  if (week.status !== "closed") {
    await recomputeRanksForWeek(week.id);
    await applyLeagueMovements(week.id);
    await updateLeaderboardWeek(week.id, {
      status: "closed",
    });
  }

  return createNextLeaderboardWeek(week, options.now ?? new Date());
}

export async function maybeCloseExpiredWeekAndCreateNext(now = new Date()) {
  const activeWeek = await findActiveLeaderboardWeek();

  if (activeWeek && activeWeek.endsAt.getTime() > now.getTime()) {
    return activeWeek;
  }

  if (activeWeek) {
    return finalizeLeaderboardWeek(activeWeek.id, { now });
  }

  return createNextLeaderboardWeek(null, now);
}

export async function ensureActiveLeaderboardWeek(now = new Date()) {
  return maybeCloseExpiredWeekAndCreateNext(now);
}

export async function getCurrentLeaderboardWeek(now = new Date()) {
  return ensureActiveLeaderboardWeek(now);
}

export async function findOrCreateLeaderboardEntryForUser(userId: string) {
  const week = await ensureActiveLeaderboardWeek();
  const existing = await findLeaderboardEntryByWeekAndUser(week.id, userId);

  if (existing) {
    await recomputeGroupRanks(existing.groupId);
    return (await findLeaderboardEntryById(existing.id)) ?? existing;
  }

  const user = await findUserById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  const [groups, weekEntries] = await Promise.all([
    listLeaderboardGroupsByWeekAndLeague(week.id, user.currentLeague),
    listLeaderboardEntriesByWeek(week.id),
  ]);
  const entryCountByGroupId = weekEntries.reduce<Map<string, number>>((map, entry) => {
    map.set(entry.groupId, (map.get(entry.groupId) ?? 0) + 1);
    return map;
  }, new Map());

  let targetGroup =
    groups.find((group) => (entryCountByGroupId.get(group.id) ?? 0) < LEADERBOARD_TARGET_GROUP_SIZE) ??
    null;

  if (!targetGroup) {
    targetGroup = await createLeaderboardGroup({
      weekId: week.id,
      league: user.currentLeague,
      groupNumber: (groups.at(-1)?.groupNumber ?? 0) + 1,
    });
  }

  if (!targetGroup) {
    throw new Error("Unable to create a leaderboard group.");
  }

  const entry = await createLeaderboardEntry({
    weekId: week.id,
    groupId: targetGroup.id,
    userId,
    league: user.currentLeague,
  });

  if (!entry) {
    throw new Error("Unable to create a leaderboard entry.");
  }

  await recomputeGroupRanks(entry.groupId);
  return (await findLeaderboardEntryById(entry.id)) ?? entry;
}

export async function recomputeGroupRanks(groupId: string) {
  const entries = await listLeaderboardEntriesByGroup(groupId);
  const rankedEntries = sortEntriesForRank(entries);

  for (const [index, entry] of rankedEntries.entries()) {
    const nextRank = index + 1;

    if (entry.rank === nextRank) {
      continue;
    }

    await updateLeaderboardEntry(entry.id, {
      rank: nextRank,
    });
  }

  return rankedEntries.length;
}

export async function recomputeRanksForWeek(weekId: string) {
  const groups = await listLeaderboardGroupsByWeek(weekId);

  for (const group of groups) {
    await recomputeGroupRanks(group.id);
  }
}

export async function applyLeagueMovements(weekId: string) {
  const groups = await listLeaderboardGroupsByWeek(weekId);

  for (const group of groups) {
    const entries = sortEntriesForRank(await listLeaderboardEntriesByGroup(group.id)).map(
      (entry, index) => ({
        ...entry,
        rank: index + 1,
      }),
    );
    const { promotionCount, demotionCount } = getLeaderboardMovementCounts(entries.length);
    const demotionMinRank = getDemotionMinRank(entries.length, demotionCount);

    for (const entry of entries) {
      const isPromotionZone = promotionCount > 0 && entry.rank <= promotionCount;
      const isDemotionZone =
        demotionMinRank !== null && entry.rank >= demotionMinRank;
      const nextLeague = isPromotionZone
        ? getPromotedLeague(entry.league)
        : isDemotionZone
          ? getDemotedLeague(entry.league)
          : entry.league;
      const promoted = isPromotionZone && nextLeague !== entry.league;
      const demoted = isDemotionZone && nextLeague !== entry.league;

      await updateLeaderboardEntry(entry.id, {
        promoted,
        demoted,
      });

      if (nextLeague !== entry.league) {
        await updateUserCurrentLeague(entry.userId, nextLeague);
      }
    }
  }
}

function getLeaderboardReward(sourceType: AwardLeaderboardXpInput["sourceType"]) {
  return LEADERBOARD_XP_REWARDS[sourceType];
}

export async function awardLeaderboardXp(input: AwardLeaderboardXpInput) {
  const sourceId = input.sourceId.trim();

  if (!sourceId) {
    throw new Error("Leaderboard sourceId is required.");
  }

  const entry = await findOrCreateLeaderboardEntryForUser(input.userId);
  const latestEntry = (await findLeaderboardEntryById(entry.id)) ?? entry;
  const xpDelta =
    typeof input.xpDelta === "number"
      ? Math.max(0, input.xpDelta)
      : getLeaderboardReward(input.sourceType);
  const activityResult = await createLeaderboardActivityIfMissing({
    entryId: latestEntry.id,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId,
    xpDelta,
  });

  if (!activityResult.created) {
    return {
      awarded: false,
      entry: latestEntry,
    };
  }

  const updatedEntry = await updateLeaderboardEntry(latestEntry.id, {
    weeklyXp: latestEntry.weeklyXp + xpDelta,
    lessonsCompleted:
      latestEntry.lessonsCompleted + (input.sourceType === "lesson" ? 1 : 0),
    practicesCompleted:
      latestEntry.practicesCompleted + (input.sourceType === "practice" ? 1 : 0),
    updatedAt: new Date(),
  });

  if (!updatedEntry) {
    throw new Error("Unable to update leaderboard XP.");
  }

  await recomputeGroupRanks(updatedEntry.groupId);

  return {
    awarded: true,
    entry: (await findLeaderboardEntryById(updatedEntry.id)) ?? updatedEntry,
  };
}

function serializeWeek(week: LeaderboardWeekRecord) {
  return {
    id: week.id,
    key: week.key,
    startsAt: week.startsAt.toISOString(),
    endsAt: week.endsAt.toISOString(),
    status: week.status,
  } as const;
}

function buildXpToNextRank(
  entries: Array<{ userId: string; weeklyXp: number }>,
  currentUserId: string,
) {
  const currentIndex = entries.findIndex((entry) => entry.userId === currentUserId);

  if (currentIndex <= 0) {
    return null;
  }

  const currentEntry = entries[currentIndex];
  const nextEntry = entries[currentIndex - 1];
  return Math.max(0, nextEntry.weeklyXp - currentEntry.weeklyXp + 1);
}

function getUsernameFallback(userId: string) {
  return `user-${userId.slice(0, 6)}`;
}

async function getLeaderboardGroupSnapshot(
  group: LeaderboardGroupRecord,
  currentUserId: string,
) {
  const entries = sortEntriesForRank(await listLeaderboardEntriesByGroup(group.id)).map(
    (entry, index) => ({
      ...entry,
      rank: index + 1,
    }),
  );
  const users = await findUsersByIds(entries.map((entry) => entry.userId));
  const userById = new Map(users.map((user) => [user.id, user]));
  const { promotionCount, demotionCount } = getLeaderboardMovementCounts(entries.length);
  const promotionMaxRank = promotionCount;
  const demotionMinRank = getDemotionMinRank(entries.length, demotionCount);
  const entrySummaries = entries.map((entry) => ({
    userId: entry.userId,
    username: userById.get(entry.userId)?.username ?? getUsernameFallback(entry.userId),
    avatarUrl: null,
    rank: entry.rank,
    weeklyXp: entry.weeklyXp,
    lessonsCompleted: entry.lessonsCompleted,
    practicesCompleted: entry.practicesCompleted,
    isCurrentUser: entry.userId === currentUserId,
    zoneStatus: getZoneStatus(entry.rank, entries.length),
  }));

  return {
    entries,
    entrySummaries,
    promotionMaxRank,
    demotionMinRank,
  };
}

export async function getLeaderboardContext(userId: string): Promise<LeaderboardResponse> {
  const week = await getCurrentLeaderboardWeek();
  const entry = await findOrCreateLeaderboardEntryForUser(userId);
  const group = await findLeaderboardGroupById(entry.groupId);

  if (!group) {
    throw new Error("Leaderboard group not found.");
  }

  await recomputeGroupRanks(group.id);
  const { entries, entrySummaries, promotionMaxRank, demotionMinRank } =
    await getLeaderboardGroupSnapshot(group, userId);
  const currentEntry = entries.find((candidate) => candidate.userId === userId);

  if (!currentEntry) {
    throw new Error("Current leaderboard entry not found.");
  }

  const zoneStatus = getZoneStatus(currentEntry.rank, entries.length);

  return {
    week: serializeWeek(week),
    league: entry.league,
    group: {
      id: group.id,
      groupNumber: group.groupNumber,
      size: entries.length,
    },
    currentUser: {
      userId,
      rank: currentEntry.rank,
      weeklyXp: currentEntry.weeklyXp,
      lessonsCompleted: currentEntry.lessonsCompleted,
      practicesCompleted: currentEntry.practicesCompleted,
      zoneStatus,
      isPromotionZone: zoneStatus === "promotion",
      isDemotionZone: zoneStatus === "demotion",
      xpToNextRank: buildXpToNextRank(entries, userId),
    },
    entries: entrySummaries,
    zones: {
      promotionMaxRank,
      demotionMinRank,
    },
    meta: {
      timeRemainingMs: Math.max(0, week.endsAt.getTime() - Date.now()),
      totalParticipants: entries.length,
    },
  };
}

export async function getLeaderboardSummary(
  userId: string,
): Promise<LeaderboardSummaryResponse> {
  const context = await getLeaderboardContext(userId);

  return {
    week: context.week,
    league: context.league,
    currentUser: {
      userId: context.currentUser.userId,
      rank: context.currentUser.rank,
      weeklyXp: context.currentUser.weeklyXp,
      zoneStatus: context.currentUser.zoneStatus,
      xpToNextRank: context.currentUser.xpToNextRank,
    },
    meta: context.meta,
  };
}
