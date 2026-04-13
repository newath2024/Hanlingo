import "dotenv/config";

import {
  findLeaderboardWeekByKey,
  findUserByEmailOrUsername,
  findUserById,
  findUsersByIds,
  listLeaderboardWeeks,
} from "../../lib/server/data-store";
import { backfillLeaderboardWeekMovements } from "../../lib/server/leaderboard";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function printUsage() {
  console.log(
    [
      "Usage: npm run leaderboard:backfill -- [--week YYYY-MM-DD] [--user <id|email|username>] [--apply] [--skip-active-sync] [--allow-non-adjacent]",
      "",
      "Defaults:",
      "- dry-run mode unless --apply is provided",
      "- targets the most recent closed leaderboard week",
      "- syncs the user's active-week entry into the corrected league when needed",
    ].join("\n"),
  );
}

async function resolveUserId(identifier: string) {
  const byId = await findUserById(identifier);

  if (byId) {
    return byId.id;
  }

  const byEmailOrUsername = await findUserByEmailOrUsername(identifier);
  return byEmailOrUsername?.id ?? null;
}

async function run() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const applyChanges = hasFlag("--apply");
  const skipActiveSync = hasFlag("--skip-active-sync");
  const allowNonAdjacent = hasFlag("--allow-non-adjacent");
  const requestedWeekKey = getFlagValue("--week");
  const requestedUser = getFlagValue("--user");
  const latestClosedWeek = (await listLeaderboardWeeks()).find((week) => week.status === "closed");
  const defaultWeekKey = latestClosedWeek?.key ?? null;
  const targetWeekKey = requestedWeekKey ?? defaultWeekKey;

  if (!targetWeekKey) {
    throw new Error("No closed leaderboard week was found to backfill.");
  }

  if (!allowNonAdjacent && defaultWeekKey && targetWeekKey !== defaultWeekKey) {
    throw new Error(
      `This script only targets the most recent closed week by default (${defaultWeekKey}). Re-run with --allow-non-adjacent if you intentionally need an older week.`,
    );
  }

  const targetWeek = await findLeaderboardWeekByKey(targetWeekKey);

  if (!targetWeek) {
    throw new Error(`Leaderboard week ${targetWeekKey} was not found.`);
  }

  if (targetWeek.status !== "closed") {
    throw new Error(`Leaderboard week ${targetWeekKey} is not closed yet.`);
  }

  const userIds =
    requestedUser !== null
      ? [await resolveUserId(requestedUser)].filter((value): value is string => Boolean(value))
      : undefined;

  if (requestedUser && (!userIds || userIds.length === 0)) {
    throw new Error(`User ${requestedUser} was not found.`);
  }

  const result = await backfillLeaderboardWeekMovements(targetWeek.id, {
    dryRun: !applyChanges,
    syncActiveWeek: !skipActiveSync,
    userIds,
  });
  const users = await findUsersByIds(result.changes.map((change) => change.userId));
  const userById = new Map(users.map((user) => [user.id, user]));

  console.log(
    [
      `Week: ${result.week.key} (${result.week.status})`,
      `Mode: ${result.dryRun ? "dry-run" : "apply"}`,
      `Scope: ${requestedUser ?? "all affected users"}`,
      `Active-week sync: ${result.syncActiveWeek ? "enabled" : "disabled"}`,
      `Users needing correction: ${result.totals.usersNeedingCorrection}`,
      `Closed-week entries updated: ${result.totals.closedWeekEntriesUpdated}`,
      `Current leagues updated: ${result.totals.currentLeaguesUpdated}`,
      `Active-week entries moved: ${result.totals.activeWeekEntriesSynced}`,
    ].join("\n"),
  );

  if (result.changes.length === 0) {
    console.log("No retroactive leaderboard corrections are needed.");
    return;
  }

  console.log("\nPlanned changes:");

  for (const change of result.changes) {
    const label = userById.get(change.userId)?.username ?? change.userId;
    const activeWeekNote = change.needsActiveWeekSync
      ? `, active week ${change.activeWeekEntryLeague} -> ${change.expectedLeague}`
      : "";

    console.log(
      `- ${label}: rank #${change.rank}, ${change.sourceLeague} -> ${change.expectedLeague}, ` +
        `flags ${change.needsClosedWeekFlagUpdate ? "update" : "ok"}, ` +
        `currentLeague ${change.needsCurrentLeagueUpdate ? "update" : "ok"}${activeWeekNote}`,
    );
  }

  if (result.dryRun) {
    const commandParts = ["npm run leaderboard:backfill -- --apply"];

    if (requestedWeekKey) {
      commandParts.push(`--week ${requestedWeekKey}`);
    }

    if (requestedUser) {
      commandParts.push(`--user ${requestedUser}`);
    }

    if (skipActiveSync) {
      commandParts.push("--skip-active-sync");
    }

    if (allowNonAdjacent) {
      commandParts.push("--allow-non-adjacent");
    }

    console.log(`\nTo apply: ${commandParts.join(" ")}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
