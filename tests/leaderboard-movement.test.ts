import assert from "node:assert/strict";
import test from "node:test";
import { getLeaderboardMovementCounts } from "../lib/constants/leaderboard";

test("empty groups do not move any players", () => {
  assert.deepStrictEqual(getLeaderboardMovementCounts(0), {
    promotionCount: 0,
    demotionCount: 0,
  });
});

test("single-player groups still promote the leader", () => {
  assert.deepStrictEqual(getLeaderboardMovementCounts(1), {
    promotionCount: 1,
    demotionCount: 0,
  });
});

test("two-player groups promote first place without demotions", () => {
  assert.deepStrictEqual(getLeaderboardMovementCounts(2), {
    promotionCount: 1,
    demotionCount: 0,
  });
});

test("three-player groups keep the existing promote and demote split", () => {
  assert.deepStrictEqual(getLeaderboardMovementCounts(3), {
    promotionCount: 1,
    demotionCount: 1,
  });
});
