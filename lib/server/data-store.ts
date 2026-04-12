import "server-only";

import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AttemptSourceContext,
  ErrorType,
  FingerprintType,
  LeaderboardActivitySourceType as PrismaLeaderboardActivitySourceType,
  LeaderboardLeague as PrismaLeaderboardLeague,
  LeaderboardWeekStatus as PrismaLeaderboardWeekStatus,
  Prisma,
} from "@prisma/client";
import {
  DEFAULT_LEADERBOARD_LEAGUE,
  isLeaderboardLeague,
  type LeaderboardActivitySourceType,
  type LeaderboardLeague,
  type LeaderboardWeekStatus,
} from "@/lib/constants/leaderboard";
import { createDefaultUserProgressState } from "@/lib/progress-state";
import { getServerEnv } from "@/lib/server/env";
import { prisma } from "@/lib/server/prisma";
import type { ErrorType as SharedErrorType } from "@/types/error-tracking";
import type {
  FingerprintType as SharedFingerprintType,
  MistakeAnalysisPayload,
} from "@/types/error-fingerprint";
import type { AttemptSourceContext as SharedAttemptSourceContext } from "@/types/error-heatmap";

export class DuplicateUserError extends Error {
  constructor() {
    super("DUPLICATE_USER");
    this.name = "DuplicateUserError";
  }
}

export type UserRecord = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  currentLeague: LeaderboardLeague;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionWithUserRecord = SessionRecord & {
  user: UserRecord;
};

export type ProgressRecord = {
  id: string;
  userId: string;
  xp: number;
  completedLessons: unknown;
  claimedStepRewards: unknown;
  completedNodes: unknown;
  completedUnits: unknown;
  pathVersions: unknown;
  nodeRuns: unknown;
  errorPatternMisses: unknown;
  reviews: unknown;
  sentenceExposures: unknown;
  importedFromLocalAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserErrorType = SharedErrorType;

export type UserErrorRecord = {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  errorType: UserErrorType;
  userAnswer: string;
  correctAnswer: string;
  errorCount: number;
  lastSeenAt: Date;
  nextReviewAt: Date;
  createdAt: Date;
};

export type UserErrorFingerprintType = SharedFingerprintType;

export type UserErrorFingerprintRecord = {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  exerciseType: string;
  fingerprintType: UserErrorFingerprintType;
  confidenceScore: number;
  userAnswerRaw: string;
  correctAnswerRaw: string;
  analysisPayload: MistakeAnalysisPayload;
  responseTimeMs: number | null;
  priorAttempts: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UserQuestionAttemptSourceContext = SharedAttemptSourceContext;

export type UserQuestionAttemptRecord = {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  unitId: string;
  nodeId: string;
  sourceContext: UserQuestionAttemptSourceContext;
  wasCorrect: boolean;
  responseTimeMs: number | null;
  createdAt: Date;
};

export type LeaderboardWeekRecord = {
  id: string;
  key: string;
  startsAt: Date;
  endsAt: Date;
  status: LeaderboardWeekStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type LeaderboardGroupRecord = {
  id: string;
  weekId: string;
  league: LeaderboardLeague;
  groupNumber: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LeaderboardEntryRecord = {
  id: string;
  weekId: string;
  groupId: string;
  userId: string;
  league: LeaderboardLeague;
  weeklyXp: number;
  rank: number | null;
  lessonsCompleted: number;
  practicesCompleted: number;
  promoted: boolean;
  demoted: boolean;
  joinedAt: Date;
  updatedAt: Date;
};

export type LeaderboardActivityRecord = {
  id: string;
  entryId: string;
  userId: string;
  sourceType: LeaderboardActivitySourceType;
  sourceId: string;
  xpDelta: number;
  createdAt: Date;
};

type FileStoreShape = {
  users: Array<{
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    currentLeague?: LeaderboardLeague;
    createdAt: string;
    updatedAt: string;
  }>;
  sessions: Array<{
    id: string;
    tokenHash: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
  progress: Array<{
    id: string;
    userId: string;
    xp: number;
    completedLessons: unknown;
    claimedStepRewards: unknown;
    completedNodes: unknown;
    completedUnits: unknown;
    pathVersions: unknown;
    nodeRuns: unknown;
    errorPatternMisses: unknown;
    reviews: unknown;
    sentenceExposures: unknown;
    importedFromLocalAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  errors: Array<{
    id: string;
    userId: string;
    questionId: string;
    lessonId: string;
    errorType: UserErrorType;
    userAnswer: string;
    correctAnswer: string;
    errorCount: number;
    lastSeenAt: string;
    nextReviewAt: string;
    createdAt: string;
  }>;
  errorFingerprints: Array<{
    id: string;
    userId: string;
    questionId: string;
    lessonId: string;
    exerciseType: string;
    fingerprintType: UserErrorFingerprintType;
    confidenceScore: number;
    userAnswerRaw: string;
    correctAnswerRaw: string;
    analysisPayload: MistakeAnalysisPayload;
    responseTimeMs: number | null;
    priorAttempts: number;
    createdAt: string;
    updatedAt: string;
  }>;
  questionAttempts: Array<{
    id: string;
    userId: string;
    questionId: string;
    lessonId: string;
    unitId: string;
    nodeId: string;
    sourceContext: UserQuestionAttemptSourceContext;
    wasCorrect: boolean;
    responseTimeMs: number | null;
    createdAt: string;
  }>;
  leaderboardWeeks: Array<{
    id: string;
    key: string;
    startsAt: string;
    endsAt: string;
    status: LeaderboardWeekStatus;
    createdAt: string;
    updatedAt: string;
  }>;
  leaderboardGroups: Array<{
    id: string;
    weekId: string;
    league: LeaderboardLeague;
    groupNumber: number;
    createdAt: string;
    updatedAt: string;
  }>;
  leaderboardEntries: Array<{
    id: string;
    weekId: string;
    groupId: string;
    userId: string;
    league: LeaderboardLeague;
    weeklyXp: number;
    rank: number | null;
    lessonsCompleted: number;
    practicesCompleted: number;
    promoted: boolean;
    demoted: boolean;
    joinedAt: string;
    updatedAt: string;
  }>;
  leaderboardActivities: Array<{
    id: string;
    entryId: string;
    userId: string;
    sourceType: LeaderboardActivitySourceType;
    sourceId: string;
    xpDelta: number;
    createdAt: string;
  }>;
};

const FILE_STORE_PATH = path.join(process.cwd(), ".local-data", "dev-auth-store.json");
const FILE_STORE_LOCK_PATH = path.join(process.cwd(), ".local-data", "dev-auth-store.lock");

declare global {
  var __hanlingoFileStoreWriteChain: Promise<void> | undefined;
}

let writeChain = globalThis.__hanlingoFileStoreWriteChain ?? Promise.resolve();

function isFileStoreEnabled() {
  return process.env.HANLINGO_DEV_FILE_STORE === "true";
}

function normalizeLeaderboardLeague(value: string | undefined | null): LeaderboardLeague {
  return value && isLeaderboardLeague(value) ? value : DEFAULT_LEADERBOARD_LEAGUE;
}

function normalizeLeaderboardWeekStatus(value: string | undefined | null): LeaderboardWeekStatus {
  return value === "closed" ? "closed" : "active";
}

function toUserRecord(user: FileStoreShape["users"][number]): UserRecord {
  return {
    ...user,
    currentLeague: normalizeLeaderboardLeague(user.currentLeague),
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function toSessionRecord(session: FileStoreShape["sessions"][number]): SessionRecord {
  return {
    ...session,
    expiresAt: new Date(session.expiresAt),
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

function toProgressRecord(record: FileStoreShape["progress"][number]): ProgressRecord {
  return {
    ...record,
    importedFromLocalAt: record.importedFromLocalAt ? new Date(record.importedFromLocalAt) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toUserErrorRecord(record: FileStoreShape["errors"][number]): UserErrorRecord {
  return {
    ...record,
    lastSeenAt: new Date(record.lastSeenAt),
    nextReviewAt: new Date(record.nextReviewAt),
    createdAt: new Date(record.createdAt),
  };
}

function toUserErrorFingerprintRecord(
  record: FileStoreShape["errorFingerprints"][number],
): UserErrorFingerprintRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toUserQuestionAttemptRecord(
  record: FileStoreShape["questionAttempts"][number],
): UserQuestionAttemptRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
  };
}

function toLeaderboardWeekRecord(
  record: FileStoreShape["leaderboardWeeks"][number],
): LeaderboardWeekRecord {
  return {
    ...record,
    status: normalizeLeaderboardWeekStatus(record.status),
    startsAt: new Date(record.startsAt),
    endsAt: new Date(record.endsAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toLeaderboardGroupRecord(
  record: FileStoreShape["leaderboardGroups"][number],
): LeaderboardGroupRecord {
  return {
    ...record,
    league: normalizeLeaderboardLeague(record.league),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toLeaderboardEntryRecord(
  record: FileStoreShape["leaderboardEntries"][number],
): LeaderboardEntryRecord {
  return {
    ...record,
    league: normalizeLeaderboardLeague(record.league),
    rank: typeof record.rank === "number" ? record.rank : null,
    joinedAt: new Date(record.joinedAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toLeaderboardActivityRecord(
  record: FileStoreShape["leaderboardActivities"][number],
): LeaderboardActivityRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
  };
}

function toPrismaLeaderboardWeekRecord(record: {
  id: string;
  key: string;
  startsAt: Date;
  endsAt: Date;
  status: PrismaLeaderboardWeekStatus;
  createdAt: Date;
  updatedAt: Date;
}): LeaderboardWeekRecord {
  return {
    ...record,
    status: record.status as LeaderboardWeekStatus,
  };
}

function toPrismaLeaderboardGroupRecord(record: {
  id: string;
  weekId: string;
  league: PrismaLeaderboardLeague;
  groupNumber: number;
  createdAt: Date;
  updatedAt: Date;
}): LeaderboardGroupRecord {
  return {
    ...record,
    league: record.league as LeaderboardLeague,
  };
}

function toPrismaLeaderboardEntryRecord(record: {
  id: string;
  weekId: string;
  groupId: string;
  userId: string;
  league: PrismaLeaderboardLeague;
  weeklyXp: number;
  rank: number | null;
  lessonsCompleted: number;
  practicesCompleted: number;
  promoted: boolean;
  demoted: boolean;
  joinedAt: Date;
  updatedAt: Date;
}): LeaderboardEntryRecord {
  return {
    ...record,
    league: record.league as LeaderboardLeague,
  };
}

function toPrismaLeaderboardActivityRecord(record: {
  id: string;
  entryId: string;
  userId: string;
  sourceType: PrismaLeaderboardActivitySourceType;
  sourceId: string;
  xpDelta: number;
  createdAt: Date;
}): LeaderboardActivityRecord {
  return {
    ...record,
    sourceType: record.sourceType as LeaderboardActivitySourceType,
  };
}

function toPrismaUserErrorFingerprintRecord(record: {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  exerciseType: string;
  fingerprintType: FingerprintType;
  confidenceScore: number;
  userAnswerRaw: string;
  correctAnswerRaw: string;
  analysisPayload: Prisma.JsonValue;
  responseTimeMs: number | null;
  priorAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}): UserErrorFingerprintRecord {
  return {
    ...record,
    fingerprintType: record.fingerprintType as UserErrorFingerprintType,
    analysisPayload: (record.analysisPayload ?? {}) as MistakeAnalysisPayload,
  };
}

function toPrismaUserQuestionAttemptRecord(record: {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  unitId: string;
  nodeId: string;
  sourceContext: AttemptSourceContext;
  wasCorrect: boolean;
  responseTimeMs: number | null;
  createdAt: Date;
}): UserQuestionAttemptRecord {
  return {
    ...record,
    sourceContext: record.sourceContext as UserQuestionAttemptSourceContext,
  };
}

function createDefaultProgressRecord(userId: string): ProgressRecord {
  const now = new Date();
  const defaults = createDefaultUserProgressState();

  return {
    id: randomUUID(),
    userId,
    xp: defaults.xp,
    completedLessons: defaults.completedLessons,
    claimedStepRewards: defaults.claimedStepRewards,
    completedNodes: defaults.completedNodes,
    completedUnits: defaults.completedUnits,
    pathVersions: defaults.pathVersions,
    nodeRuns: defaults.nodeRuns,
    errorPatternMisses: defaults.errorPatternMisses,
    reviews: defaults.reviews,
    sentenceExposures: defaults.sentenceExposures,
    importedFromLocalAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureFileStore() {
  await mkdir(path.dirname(FILE_STORE_PATH), { recursive: true });

  try {
    await readFile(FILE_STORE_PATH, "utf8");
  } catch {
    const emptyStore: FileStoreShape = {
      users: [],
      sessions: [],
      progress: [],
      errors: [],
      errorFingerprints: [],
      questionAttempts: [],
      leaderboardWeeks: [],
      leaderboardGroups: [],
      leaderboardEntries: [],
      leaderboardActivities: [],
    };
    await writeFile(FILE_STORE_PATH, JSON.stringify(emptyStore, null, 2), "utf8");
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isFileStoreLocked() {
  try {
    await access(FILE_STORE_LOCK_PATH);
    return true;
  } catch {
    return false;
  }
}

async function waitForFileStoreLockRelease(maxAttempts = 80, delayMs = 25) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!(await isFileStoreLocked())) {
      return;
    }

    await sleep(delayMs);
  }
}

async function acquireFileStoreLock(maxAttempts = 200, delayMs = 25) {
  await mkdir(path.dirname(FILE_STORE_LOCK_PATH), { recursive: true });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const handle = await open(FILE_STORE_LOCK_PATH, "wx");
      await handle.close();
      return;
    } catch (error) {
      if (isErrnoException(error) && error.code === "EEXIST") {
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Timed out waiting for the dev auth store lock.");
}

async function releaseFileStoreLock() {
  try {
    await unlink(FILE_STORE_LOCK_PATH);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function findTopLevelJsonObjectEnd(raw: string) {
  let started = false;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (!started) {
      if (/\s/.test(character)) {
        continue;
      }

      if (character !== "{") {
        return null;
      }

      started = true;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (character === "\\") {
        escapeNext = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function recoverFileStoreFromTrailingContent(raw: string) {
  const objectEndIndex = findTopLevelJsonObjectEnd(raw);

  if (objectEndIndex === null) {
    return null;
  }

  const trailingContent = raw.slice(objectEndIndex + 1);

  if (!trailingContent.trim()) {
    return null;
  }

  try {
    return normalizeFileStoreShape(JSON.parse(raw.slice(0, objectEndIndex + 1)));
  } catch {
    return null;
  }
}

function normalizeFileStoreShape(value: unknown): FileStoreShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      users: [],
      sessions: [],
      progress: [],
      errors: [],
      errorFingerprints: [],
      questionAttempts: [],
      leaderboardWeeks: [],
      leaderboardGroups: [],
      leaderboardEntries: [],
      leaderboardActivities: [],
    };
  }

  const candidate = value as Partial<FileStoreShape>;

  return {
    users: Array.isArray(candidate.users) ? candidate.users : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    progress: Array.isArray(candidate.progress) ? candidate.progress : [],
    errors: Array.isArray(candidate.errors) ? candidate.errors : [],
    errorFingerprints: Array.isArray(candidate.errorFingerprints)
      ? candidate.errorFingerprints
      : [],
    questionAttempts: Array.isArray(candidate.questionAttempts)
      ? candidate.questionAttempts
      : [],
    leaderboardWeeks: Array.isArray(candidate.leaderboardWeeks)
      ? candidate.leaderboardWeeks
      : [],
    leaderboardGroups: Array.isArray(candidate.leaderboardGroups)
      ? candidate.leaderboardGroups
      : [],
    leaderboardEntries: Array.isArray(candidate.leaderboardEntries)
      ? candidate.leaderboardEntries
      : [],
    leaderboardActivities: Array.isArray(candidate.leaderboardActivities)
      ? candidate.leaderboardActivities
      : [],
  };
}

function parseFileStore(raw: string) {
  try {
    return normalizeFileStoreShape(JSON.parse(raw));
  } catch (error) {
    const recovered = recoverFileStoreFromTrailingContent(raw);

    if (recovered) {
      console.warn("[file-store] Recovered trailing garbage from dev auth store JSON.");
      return recovered;
    }

    throw error;
  }
}

async function readFileStoreUnsafe(): Promise<FileStoreShape> {
  const raw = await readFile(FILE_STORE_PATH, "utf8");
  return parseFileStore(raw);
}

async function readFileStore(): Promise<FileStoreShape> {
  await ensureFileStore();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForFileStoreLockRelease();

    try {
      return await readFileStoreUnsafe();
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }

      await sleep(25 * (attempt + 1));
    }
  }

  throw new Error("Unable to read the dev auth store.");
}

async function writeFileStore(store: FileStoreShape) {
  await writeFile(FILE_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function withFileStoreMutation<T>(mutator: (store: FileStoreShape) => T | Promise<T>) {
  let result!: T;

  const pendingMutation = writeChain.catch(() => undefined).then(async () => {
    await ensureFileStore();
    await acquireFileStoreLock();

    try {
      const store = await readFileStoreUnsafe();
      result = await mutator(store);
      await writeFileStore(store);
    } finally {
      await releaseFileStoreLock();
    }
  });

  writeChain = pendingMutation.then(() => undefined, () => undefined);
  globalThis.__hanlingoFileStoreWriteChain = writeChain;

  await pendingMutation;
  return result;
}

function assertEnvLoaded() {
  getServerEnv();
}

export async function findUserByEmail(email: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  const store = await readFileStore();
  const user = store.users.find((entry) => entry.email === email);
  return user ? toUserRecord(user) : null;
}

export async function findUserById(id: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  }

  const store = await readFileStore();
  const user = store.users.find((entry) => entry.id === id);
  return user ? toUserRecord(user) : null;
}

export async function findUsersByIds(userIds: string[]) {
  assertEnvLoaded();

  if (userIds.length === 0) {
    return [] as UserRecord[];
  }

  if (!isFileStoreEnabled()) {
    return prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }

  const requestedIds = new Set(userIds);
  const store = await readFileStore();

  return store.users
    .filter((entry) => requestedIds.has(entry.id))
    .map(toUserRecord);
}

export async function updateUserCurrentLeague(
  userId: string,
  currentLeague: LeaderboardLeague,
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        currentLeague: currentLeague as PrismaLeaderboardLeague,
      },
    });
  }

  return withFileStoreMutation(async (store) => {
    const user = store.users.find((entry) => entry.id === userId);

    if (!user) {
      return null;
    }

    user.currentLeague = currentLeague;
    user.updatedAt = new Date().toISOString();
    return toUserRecord(user);
  });
}

export async function createUser(input: {
  email: string;
  username: string;
  passwordHash: string;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    try {
      return await prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash: input.passwordHash,
          progress: {
            create: {},
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DuplicateUserError();
      }

      throw error;
    }
  }

  return withFileStoreMutation(async (store) => {
    if (
      store.users.some(
        (entry) => entry.email === input.email || entry.username === input.username,
      )
    ) {
      throw new DuplicateUserError();
    }

    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
      currentLeague: DEFAULT_LEADERBOARD_LEAGUE,
      createdAt: now,
      updatedAt: now,
    };

    store.users.push(user);
    store.progress.push({
      ...createDefaultProgressRecord(user.id),
      importedFromLocalAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return toUserRecord(user);
  });
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.session.create({
      data: input,
    });
  }

  return withFileStoreMutation(async (store) => {
    const now = new Date().toISOString();
    const session = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    store.sessions.push(session);
    return toSessionRecord(session);
  });
}

export async function deleteSessionsByTokenHash(tokenHash: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    await prisma.session.deleteMany({
      where: {
        tokenHash,
      },
    });
    return;
  }

  await withFileStoreMutation(async (store) => {
    store.sessions = store.sessions.filter((entry) => entry.tokenHash !== tokenHash);
  });
}

export async function getSessionByTokenHash(tokenHash: string): Promise<SessionWithUserRecord | null> {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const session = await prisma.session.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    return session;
  }

  const store = await readFileStore();
  const session = store.sessions.find((entry) => entry.tokenHash === tokenHash);

  if (!session) {
    return null;
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    return null;
  }

  return {
    ...toSessionRecord(session),
    user: toUserRecord(user),
  };
}

export async function deleteSessionById(id: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    await prisma.session.delete({
      where: {
        id,
      },
    });
    return;
  }

  await withFileStoreMutation(async (store) => {
    store.sessions = store.sessions.filter((entry) => entry.id !== id);
  });
}

export async function updateSessionExpiry(id: string, expiresAt: Date) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.session.update({
      where: {
        id,
      },
      data: {
        expiresAt,
      },
    });
  }

  return withFileStoreMutation(async (store) => {
    const session = store.sessions.find((entry) => entry.id === id);

    if (!session) {
      return null;
    }

    session.expiresAt = expiresAt.toISOString();
    session.updatedAt = new Date().toISOString();
    return toSessionRecord(session);
  });
}

export async function findProgressByUserId(userId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.userProgress.findUnique({
      where: {
        userId,
      },
    });
  }

  const store = await readFileStore();
  const progress = store.progress.find((entry) => entry.userId === userId);
  return progress ? toProgressRecord(progress) : null;
}

export async function createProgressForUser(userId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.userProgress.create({
      data: {
        userId,
      },
    });
  }

  return withFileStoreMutation(async (store) => {
    const existing = store.progress.find((entry) => entry.userId === userId);
    if (existing) {
      return toProgressRecord(existing);
    }

    const record = createDefaultProgressRecord(userId);
    store.progress.push({
      ...record,
      importedFromLocalAt: null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
    return record;
  });
}

export async function upsertProgressForUser(
  userId: string,
  data: Omit<ProgressRecord, "id" | "userId" | "createdAt" | "updatedAt">,
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const prismaData = {
      xp: data.xp,
      completedLessons: data.completedLessons as Prisma.InputJsonValue,
      claimedStepRewards: data.claimedStepRewards as Prisma.InputJsonValue,
      completedNodes: data.completedNodes as Prisma.InputJsonValue,
      completedUnits: data.completedUnits as Prisma.InputJsonValue,
      pathVersions: data.pathVersions as Prisma.InputJsonValue,
      nodeRuns: data.nodeRuns as Prisma.InputJsonValue,
      errorPatternMisses: data.errorPatternMisses as Prisma.InputJsonValue,
      reviews: data.reviews as Prisma.InputJsonValue,
      sentenceExposures: data.sentenceExposures as Prisma.InputJsonValue,
      importedFromLocalAt: data.importedFromLocalAt,
    };

    return prisma.userProgress.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        ...prismaData,
      },
      update: prismaData,
    });
  }

  return withFileStoreMutation(async (store) => {
    const now = new Date().toISOString();
    const existing = store.progress.find((entry) => entry.userId === userId);

    if (existing) {
      existing.xp = data.xp;
      existing.completedLessons = data.completedLessons;
      existing.claimedStepRewards = data.claimedStepRewards;
      existing.completedNodes = data.completedNodes;
      existing.completedUnits = data.completedUnits;
      existing.pathVersions = data.pathVersions;
      existing.nodeRuns = data.nodeRuns;
      existing.errorPatternMisses = data.errorPatternMisses;
      existing.reviews = data.reviews;
      existing.sentenceExposures = data.sentenceExposures;
      existing.importedFromLocalAt = data.importedFromLocalAt
        ? data.importedFromLocalAt.toISOString()
        : null;
      existing.updatedAt = now;
      return toProgressRecord(existing);
    }

    const created = {
      id: randomUUID(),
      userId,
      xp: data.xp,
      completedLessons: data.completedLessons,
      claimedStepRewards: data.claimedStepRewards,
      completedNodes: data.completedNodes,
      completedUnits: data.completedUnits,
      pathVersions: data.pathVersions,
      nodeRuns: data.nodeRuns,
      errorPatternMisses: data.errorPatternMisses,
      reviews: data.reviews,
      sentenceExposures: data.sentenceExposures,
      importedFromLocalAt: data.importedFromLocalAt
        ? data.importedFromLocalAt.toISOString()
        : null,
      createdAt: now,
      updatedAt: now,
    };

    store.progress.push(created);
    return toProgressRecord(created);
  });
}

function toUserErrorCreateInput(record: Omit<UserErrorRecord, "id" | "createdAt">) {
  return {
    userId: record.userId,
    questionId: record.questionId,
    lessonId: record.lessonId,
    errorType: record.errorType as ErrorType,
    userAnswer: record.userAnswer,
    correctAnswer: record.correctAnswer,
    errorCount: record.errorCount,
    lastSeenAt: record.lastSeenAt,
    nextReviewAt: record.nextReviewAt,
  };
}

function toUserErrorFingerprintCreateInput(
  record: Omit<UserErrorFingerprintRecord, "id" | "createdAt" | "updatedAt">,
) {
  return {
    userId: record.userId,
    questionId: record.questionId,
    lessonId: record.lessonId,
    exerciseType: record.exerciseType,
    fingerprintType: record.fingerprintType as FingerprintType,
    confidenceScore: record.confidenceScore,
    userAnswerRaw: record.userAnswerRaw,
    correctAnswerRaw: record.correctAnswerRaw,
    analysisPayload: record.analysisPayload as Prisma.InputJsonValue,
    responseTimeMs: record.responseTimeMs,
    priorAttempts: record.priorAttempts,
  };
}

function toUserQuestionAttemptCreateInput(
  record: Omit<UserQuestionAttemptRecord, "id" | "createdAt">,
) {
  return {
    userId: record.userId,
    questionId: record.questionId,
    lessonId: record.lessonId,
    unitId: record.unitId,
    nodeId: record.nodeId,
    sourceContext: record.sourceContext as AttemptSourceContext,
    wasCorrect: record.wasCorrect,
    responseTimeMs: record.responseTimeMs,
  };
}

export async function findUserErrorsByQuestionIds(userId: string, questionIds: string[]) {
  assertEnvLoaded();

  if (questionIds.length === 0) {
    return [] as UserErrorRecord[];
  }

  if (!isFileStoreEnabled()) {
    return prisma.userError.findMany({
      where: {
        userId,
        questionId: {
          in: questionIds,
        },
      },
    });
  }

  const requestedIds = new Set(questionIds);
  const store = await readFileStore();

  return store.errors
    .filter((entry) => entry.userId === userId && requestedIds.has(entry.questionId))
    .map(toUserErrorRecord);
}

export async function listUserErrors(userId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.userError.findMany({
      where: {
        userId,
      },
    });
  }

  const store = await readFileStore();

  return store.errors
    .filter((entry) => entry.userId === userId)
    .map(toUserErrorRecord);
}

export async function deleteUserErrorsByLessonIds(userId: string, lessonIds: string[]) {
  assertEnvLoaded();

  if (lessonIds.length === 0) {
    return;
  }

  if (!isFileStoreEnabled()) {
    await prisma.userError.deleteMany({
      where: {
        userId,
        lessonId: {
          in: lessonIds,
        },
      },
    });
    return;
  }

  const lessonIdSet = new Set(lessonIds);
  await withFileStoreMutation(async (store) => {
    store.errors = store.errors.filter(
      (entry) => entry.userId !== userId || !lessonIdSet.has(entry.lessonId),
    );
  });
}

export async function listDueUserErrors(
  userId: string,
  dueBefore: Date,
  limit: number,
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.userError.findMany({
      where: {
        userId,
        nextReviewAt: {
          lte: dueBefore,
        },
      },
      orderBy: [
        {
          errorCount: "desc",
        },
        {
          lastSeenAt: "asc",
        },
      ],
      take: limit,
    });
  }

  const dueTime = dueBefore.getTime();
  const store = await readFileStore();

  return store.errors
    .filter(
      (entry) =>
        entry.userId === userId && new Date(entry.nextReviewAt).getTime() <= dueTime,
    )
    .sort((left, right) => {
      if (right.errorCount !== left.errorCount) {
        return right.errorCount - left.errorCount;
      }

      return new Date(left.lastSeenAt).getTime() - new Date(right.lastSeenAt).getTime();
    })
    .slice(0, limit)
    .map(toUserErrorRecord);
}

export async function upsertUserErrors(
  records: Array<Omit<UserErrorRecord, "id" | "createdAt">>,
) {
  assertEnvLoaded();

  if (records.length === 0) {
    return [] as UserErrorRecord[];
  }

  if (!isFileStoreEnabled()) {
    const questionIds = [...new Set(records.map((record) => record.questionId))];
    const existingRecords = await prisma.userError.findMany({
      where: {
        userId: records[0]?.userId,
        questionId: {
          in: questionIds,
        },
      },
    });
    const existingByQuestionId = new Map(
      existingRecords.map((record) => [record.questionId, record]),
    );

    return prisma.$transaction(
      records.map((record) => {
        const existing = existingByQuestionId.get(record.questionId);
        const data = toUserErrorCreateInput(record);

        if (existing) {
          return prisma.userError.update({
            where: {
              id: existing.id,
            },
            data,
          });
        }

        return prisma.userError.create({
          data,
        });
      }),
    );
  }

  return withFileStoreMutation(async (store) =>
    records.map((record) => {
      const existing = store.errors.find(
        (entry) =>
          entry.userId === record.userId && entry.questionId === record.questionId,
      );

      if (existing) {
        existing.lessonId = record.lessonId;
        existing.errorType = record.errorType;
        existing.userAnswer = record.userAnswer;
        existing.correctAnswer = record.correctAnswer;
        existing.errorCount = record.errorCount;
        existing.lastSeenAt = record.lastSeenAt.toISOString();
        existing.nextReviewAt = record.nextReviewAt.toISOString();
        return toUserErrorRecord(existing);
      }

      const created = {
        id: randomUUID(),
        userId: record.userId,
        questionId: record.questionId,
        lessonId: record.lessonId,
        errorType: record.errorType,
        userAnswer: record.userAnswer,
        correctAnswer: record.correctAnswer,
        errorCount: record.errorCount,
        lastSeenAt: record.lastSeenAt.toISOString(),
        nextReviewAt: record.nextReviewAt.toISOString(),
        createdAt: new Date().toISOString(),
      };

      store.errors.push(created);
      return toUserErrorRecord(created);
    }),
  );
}

export async function createUserErrorFingerprints(
  records: Array<Omit<UserErrorFingerprintRecord, "id" | "createdAt" | "updatedAt">>,
) {
  assertEnvLoaded();

  if (records.length === 0) {
    return [] as UserErrorFingerprintRecord[];
  }

  if (!isFileStoreEnabled()) {
    const createdRecords = await prisma.$transaction(
      records.map((record) =>
        prisma.userErrorFingerprint.create({
          data: toUserErrorFingerprintCreateInput(record),
        }),
      ),
    );

    return createdRecords.map(toPrismaUserErrorFingerprintRecord);
  }

  return withFileStoreMutation(async (store) =>
    records.map((record) => {
      const now = new Date().toISOString();
      const created = {
        id: randomUUID(),
        userId: record.userId,
        questionId: record.questionId,
        lessonId: record.lessonId,
        exerciseType: record.exerciseType,
        fingerprintType: record.fingerprintType,
        confidenceScore: record.confidenceScore,
        userAnswerRaw: record.userAnswerRaw,
        correctAnswerRaw: record.correctAnswerRaw,
        analysisPayload: record.analysisPayload,
        responseTimeMs: record.responseTimeMs,
        priorAttempts: record.priorAttempts,
        createdAt: now,
        updatedAt: now,
      };

      store.errorFingerprints.push(created);
      return toUserErrorFingerprintRecord(created);
    }),
  );
}

export async function findLatestUserErrorFingerprintsByQuestionIds(
  userId: string,
  questionIds: string[],
) {
  assertEnvLoaded();

  if (questionIds.length === 0) {
    return [] as UserErrorFingerprintRecord[];
  }

  if (!isFileStoreEnabled()) {
    const records = await prisma.userErrorFingerprint.findMany({
      where: {
        userId,
        questionId: {
          in: questionIds,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const latestByQuestionId = new Map<string, UserErrorFingerprintRecord>();

    for (const record of records.map(toPrismaUserErrorFingerprintRecord)) {
      if (!latestByQuestionId.has(record.questionId)) {
        latestByQuestionId.set(record.questionId, record);
      }
    }

    return [...latestByQuestionId.values()];
  }

  const requestedIds = new Set(questionIds);
  const latestByQuestionId = new Map<string, FileStoreShape["errorFingerprints"][number]>();
  const store = await readFileStore();

  for (const record of [...store.errorFingerprints].reverse()) {
    if (record.userId !== userId || !requestedIds.has(record.questionId)) {
      continue;
    }

    if (!latestByQuestionId.has(record.questionId)) {
      latestByQuestionId.set(record.questionId, record);
    }
  }

  return [...latestByQuestionId.values()].map(toUserErrorFingerprintRecord);
}

export async function deleteUserErrorFingerprintsByLessonIds(
  userId: string,
  lessonIds: string[],
) {
  assertEnvLoaded();

  if (lessonIds.length === 0) {
    return;
  }

  if (!isFileStoreEnabled()) {
    await prisma.userErrorFingerprint.deleteMany({
      where: {
        userId,
        lessonId: {
          in: lessonIds,
        },
      },
    });
    return;
  }

  const lessonIdSet = new Set(lessonIds);
  await withFileStoreMutation(async (store) => {
    store.errorFingerprints = store.errorFingerprints.filter(
      (entry) => entry.userId !== userId || !lessonIdSet.has(entry.lessonId),
    );
  });
}

export async function createUserQuestionAttempts(
  records: Array<Omit<UserQuestionAttemptRecord, "id" | "createdAt">>,
) {
  assertEnvLoaded();

  if (records.length === 0) {
    return [] as UserQuestionAttemptRecord[];
  }

  if (!isFileStoreEnabled()) {
    const createdRecords = await prisma.$transaction(
      records.map((record) =>
        prisma.userQuestionAttempt.create({
          data: toUserQuestionAttemptCreateInput(record),
        }),
      ),
    );

    return createdRecords.map(toPrismaUserQuestionAttemptRecord);
  }

  return withFileStoreMutation(async (store) =>
    records.map((record) => {
      const created = {
        id: randomUUID(),
        userId: record.userId,
        questionId: record.questionId,
        lessonId: record.lessonId,
        unitId: record.unitId,
        nodeId: record.nodeId,
        sourceContext: record.sourceContext,
        wasCorrect: record.wasCorrect,
        responseTimeMs: record.responseTimeMs,
        createdAt: new Date().toISOString(),
      };

      store.questionAttempts.push(created);
      return toUserQuestionAttemptRecord(created);
    }),
  );
}

export async function deleteUserQuestionAttemptsByUnitIds(userId: string, unitIds: string[]) {
  assertEnvLoaded();

  if (unitIds.length === 0) {
    return;
  }

  if (!isFileStoreEnabled()) {
    await prisma.userQuestionAttempt.deleteMany({
      where: {
        userId,
        unitId: {
          in: unitIds,
        },
      },
    });
    return;
  }

  const unitIdSet = new Set(unitIds);
  await withFileStoreMutation(async (store) => {
    store.questionAttempts = store.questionAttempts.filter(
      (entry) => entry.userId !== userId || !unitIdSet.has(entry.unitId),
    );
  });
}

export async function listUserQuestionAttempts(
  userId: string,
  options: {
    unitId?: string;
    lessonId?: string;
  } = {},
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    return prisma.userQuestionAttempt.findMany({
      where: {
        userId,
        unitId: options.unitId,
        lessonId: options.lessonId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  const store = await readFileStore();

  return store.questionAttempts
    .filter((entry) => {
      if (entry.userId !== userId) {
        return false;
      }

      if (options.unitId && entry.unitId !== options.unitId) {
        return false;
      }

      if (options.lessonId && entry.lessonId !== options.lessonId) {
        return false;
      }

      return true;
    })
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )
    .map(toUserQuestionAttemptRecord);
}

function toLeaderboardWeekCreateInput(input: {
  key: string;
  startsAt: Date;
  endsAt: Date;
  status: LeaderboardWeekStatus;
}) {
  return {
    key: input.key,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: input.status as PrismaLeaderboardWeekStatus,
  };
}

function toLeaderboardGroupCreateInput(input: {
  weekId: string;
  league: LeaderboardLeague;
  groupNumber: number;
}) {
  return {
    weekId: input.weekId,
    league: input.league as PrismaLeaderboardLeague,
    groupNumber: input.groupNumber,
  };
}

function toLeaderboardEntryCreateInput(input: {
  weekId: string;
  groupId: string;
  userId: string;
  league: LeaderboardLeague;
  weeklyXp?: number;
  rank?: number | null;
  lessonsCompleted?: number;
  practicesCompleted?: number;
  promoted?: boolean;
  demoted?: boolean;
  joinedAt?: Date;
}) {
  return {
    weekId: input.weekId,
    groupId: input.groupId,
    userId: input.userId,
    league: input.league as PrismaLeaderboardLeague,
    weeklyXp: input.weeklyXp ?? 0,
    rank: typeof input.rank === "number" ? input.rank : null,
    lessonsCompleted: input.lessonsCompleted ?? 0,
    practicesCompleted: input.practicesCompleted ?? 0,
    promoted: input.promoted ?? false,
    demoted: input.demoted ?? false,
    joinedAt: input.joinedAt ?? new Date(),
  };
}

function toLeaderboardActivityCreateInput(input: {
  entryId: string;
  userId: string;
  sourceType: LeaderboardActivitySourceType;
  sourceId: string;
  xpDelta: number;
}) {
  return {
    entryId: input.entryId,
    userId: input.userId,
    sourceType: input.sourceType as PrismaLeaderboardActivitySourceType,
    sourceId: input.sourceId,
    xpDelta: input.xpDelta,
  };
}

export async function findActiveLeaderboardWeek() {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardWeek.findFirst({
      where: {
        status: "active",
      },
      orderBy: {
        startsAt: "desc",
      },
    });

    return record ? toPrismaLeaderboardWeekRecord(record) : null;
  }

  const store = await readFileStore();
  const record = [...store.leaderboardWeeks]
    .filter((entry) => normalizeLeaderboardWeekStatus(entry.status) === "active")
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())[0];

  return record ? toLeaderboardWeekRecord(record) : null;
}

export async function findLeaderboardWeekById(id: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardWeek.findUnique({
      where: {
        id,
      },
    });

    return record ? toPrismaLeaderboardWeekRecord(record) : null;
  }

  const store = await readFileStore();
  const record = store.leaderboardWeeks.find((entry) => entry.id === id);
  return record ? toLeaderboardWeekRecord(record) : null;
}

export async function findLeaderboardWeekByKey(key: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardWeek.findUnique({
      where: {
        key,
      },
    });

    return record ? toPrismaLeaderboardWeekRecord(record) : null;
  }

  const store = await readFileStore();
  const record = store.leaderboardWeeks.find((entry) => entry.key === key);
  return record ? toLeaderboardWeekRecord(record) : null;
}

export async function createLeaderboardWeek(input: {
  key: string;
  startsAt: Date;
  endsAt: Date;
  status: LeaderboardWeekStatus;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    try {
      const record = await prisma.leaderboardWeek.create({
        data: toLeaderboardWeekCreateInput(input),
      });

      return toPrismaLeaderboardWeekRecord(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return findLeaderboardWeekByKey(input.key);
      }

      throw error;
    }
  }

  return withFileStoreMutation(async (store) => {
    const existing = store.leaderboardWeeks.find((entry) => entry.key === input.key);

    if (existing) {
      return toLeaderboardWeekRecord(existing);
    }

    const now = new Date().toISOString();
    const created = {
      id: randomUUID(),
      key: input.key,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };

    store.leaderboardWeeks.push(created);
    return toLeaderboardWeekRecord(created);
  });
}

export async function updateLeaderboardWeek(
  id: string,
  data: {
    key?: string;
    startsAt?: Date;
    endsAt?: Date;
    status?: LeaderboardWeekStatus;
  },
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const updateData: Prisma.LeaderboardWeekUpdateInput = {};

    if (typeof data.key === "string") {
      updateData.key = data.key;
    }

    if (data.startsAt) {
      updateData.startsAt = data.startsAt;
    }

    if (data.endsAt) {
      updateData.endsAt = data.endsAt;
    }

    if (data.status) {
      updateData.status = data.status as PrismaLeaderboardWeekStatus;
    }

    const record = await prisma.leaderboardWeek.update({
      where: {
        id,
      },
      data: updateData,
    });

    return toPrismaLeaderboardWeekRecord(record);
  }

  return withFileStoreMutation(async (store) => {
    const record = store.leaderboardWeeks.find((entry) => entry.id === id);

    if (!record) {
      return null;
    }

    if (typeof data.key === "string") {
      record.key = data.key;
    }

    if (data.startsAt) {
      record.startsAt = data.startsAt.toISOString();
    }

    if (data.endsAt) {
      record.endsAt = data.endsAt.toISOString();
    }

    if (data.status) {
      record.status = data.status;
    }

    record.updatedAt = new Date().toISOString();
    return toLeaderboardWeekRecord(record);
  });
}

export async function findLeaderboardGroupById(id: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardGroup.findUnique({
      where: {
        id,
      },
    });

    return record ? toPrismaLeaderboardGroupRecord(record) : null;
  }

  const store = await readFileStore();
  const record = store.leaderboardGroups.find((entry) => entry.id === id);
  return record ? toLeaderboardGroupRecord(record) : null;
}

export async function listLeaderboardGroupsByWeek(weekId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const records = await prisma.leaderboardGroup.findMany({
      where: {
        weekId,
      },
      orderBy: [
        {
          league: "asc",
        },
        {
          groupNumber: "asc",
        },
      ],
    });

    return records.map(toPrismaLeaderboardGroupRecord);
  }

  const store = await readFileStore();

  return store.leaderboardGroups
    .filter((entry) => entry.weekId === weekId)
    .sort((left, right) => {
      if (left.league !== right.league) {
        return left.league.localeCompare(right.league);
      }

      return left.groupNumber - right.groupNumber;
    })
    .map(toLeaderboardGroupRecord);
}

export async function listLeaderboardGroupsByWeekAndLeague(
  weekId: string,
  league: LeaderboardLeague,
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const records = await prisma.leaderboardGroup.findMany({
      where: {
        weekId,
        league: league as PrismaLeaderboardLeague,
      },
      orderBy: {
        groupNumber: "asc",
      },
    });

    return records.map(toPrismaLeaderboardGroupRecord);
  }

  const store = await readFileStore();

  return store.leaderboardGroups
    .filter(
      (entry) =>
        entry.weekId === weekId && normalizeLeaderboardLeague(entry.league) === league,
    )
    .sort((left, right) => left.groupNumber - right.groupNumber)
    .map(toLeaderboardGroupRecord);
}

export async function createLeaderboardGroup(input: {
  weekId: string;
  league: LeaderboardLeague;
  groupNumber: number;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    try {
      const record = await prisma.leaderboardGroup.create({
        data: toLeaderboardGroupCreateInput(input),
      });

      return toPrismaLeaderboardGroupRecord(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.leaderboardGroup.findFirst({
          where: {
            weekId: input.weekId,
            league: input.league as PrismaLeaderboardLeague,
            groupNumber: input.groupNumber,
          },
        });

        return existing ? toPrismaLeaderboardGroupRecord(existing) : null;
      }

      throw error;
    }
  }

  return withFileStoreMutation(async (store) => {
    const existing = store.leaderboardGroups.find(
      (entry) =>
        entry.weekId === input.weekId &&
        normalizeLeaderboardLeague(entry.league) === input.league &&
        entry.groupNumber === input.groupNumber,
    );

    if (existing) {
      return toLeaderboardGroupRecord(existing);
    }

    const now = new Date().toISOString();
    const created = {
      id: randomUUID(),
      weekId: input.weekId,
      league: input.league,
      groupNumber: input.groupNumber,
      createdAt: now,
      updatedAt: now,
    };

    store.leaderboardGroups.push(created);
    return toLeaderboardGroupRecord(created);
  });
}

export async function findLeaderboardEntryById(id: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardEntry.findUnique({
      where: {
        id,
      },
    });

    return record ? toPrismaLeaderboardEntryRecord(record) : null;
  }

  const store = await readFileStore();
  const record = store.leaderboardEntries.find((entry) => entry.id === id);
  return record ? toLeaderboardEntryRecord(record) : null;
}

export async function findLeaderboardEntryByWeekAndUser(
  weekId: string,
  userId: string,
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const record = await prisma.leaderboardEntry.findUnique({
      where: {
        weekId_userId: {
          weekId,
          userId,
        },
      },
    });

    return record ? toPrismaLeaderboardEntryRecord(record) : null;
  }

  const store = await readFileStore();
  const record = store.leaderboardEntries.find(
    (entry) => entry.weekId === weekId && entry.userId === userId,
  );
  return record ? toLeaderboardEntryRecord(record) : null;
}

export async function listLeaderboardEntriesByGroup(groupId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const records = await prisma.leaderboardEntry.findMany({
      where: {
        groupId,
      },
      orderBy: [
        {
          rank: "asc",
        },
        {
          weeklyXp: "desc",
        },
        {
          updatedAt: "asc",
        },
      ],
    });

    return records.map(toPrismaLeaderboardEntryRecord);
  }

  const store = await readFileStore();

  return store.leaderboardEntries
    .filter((entry) => entry.groupId === groupId)
    .sort((left, right) => {
      const leftRank = typeof left.rank === "number" ? left.rank : Number.MAX_SAFE_INTEGER;
      const rightRank = typeof right.rank === "number" ? right.rank : Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (right.weeklyXp !== left.weeklyXp) {
        return right.weeklyXp - left.weeklyXp;
      }

      return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    })
    .map(toLeaderboardEntryRecord);
}

export async function listLeaderboardEntriesByWeek(weekId: string) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const records = await prisma.leaderboardEntry.findMany({
      where: {
        weekId,
      },
      orderBy: [
        {
          groupId: "asc",
        },
        {
          rank: "asc",
        },
        {
          weeklyXp: "desc",
        },
      ],
    });

    return records.map(toPrismaLeaderboardEntryRecord);
  }

  const store = await readFileStore();

  return store.leaderboardEntries
    .filter((entry) => entry.weekId === weekId)
    .sort((left, right) => {
      if (left.groupId !== right.groupId) {
        return left.groupId.localeCompare(right.groupId);
      }

      const leftRank = typeof left.rank === "number" ? left.rank : Number.MAX_SAFE_INTEGER;
      const rightRank = typeof right.rank === "number" ? right.rank : Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.weeklyXp - left.weeklyXp;
    })
    .map(toLeaderboardEntryRecord);
}

export async function createLeaderboardEntry(input: {
  weekId: string;
  groupId: string;
  userId: string;
  league: LeaderboardLeague;
  weeklyXp?: number;
  rank?: number | null;
  lessonsCompleted?: number;
  practicesCompleted?: number;
  promoted?: boolean;
  demoted?: boolean;
  joinedAt?: Date;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    try {
      const record = await prisma.leaderboardEntry.create({
        data: toLeaderboardEntryCreateInput(input),
      });

      return toPrismaLeaderboardEntryRecord(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return findLeaderboardEntryByWeekAndUser(input.weekId, input.userId);
      }

      throw error;
    }
  }

  return withFileStoreMutation(async (store) => {
    const existing = store.leaderboardEntries.find(
      (entry) => entry.weekId === input.weekId && entry.userId === input.userId,
    );

    if (existing) {
      return toLeaderboardEntryRecord(existing);
    }

    const joinedAt = input.joinedAt ?? new Date();
    const created = {
      id: randomUUID(),
      weekId: input.weekId,
      groupId: input.groupId,
      userId: input.userId,
      league: input.league,
      weeklyXp: input.weeklyXp ?? 0,
      rank: typeof input.rank === "number" ? input.rank : null,
      lessonsCompleted: input.lessonsCompleted ?? 0,
      practicesCompleted: input.practicesCompleted ?? 0,
      promoted: input.promoted ?? false,
      demoted: input.demoted ?? false,
      joinedAt: joinedAt.toISOString(),
      updatedAt: joinedAt.toISOString(),
    };

    store.leaderboardEntries.push(created);
    return toLeaderboardEntryRecord(created);
  });
}

export async function updateLeaderboardEntry(
  id: string,
  data: {
    groupId?: string;
    league?: LeaderboardLeague;
    weeklyXp?: number;
    rank?: number | null;
    lessonsCompleted?: number;
    practicesCompleted?: number;
    promoted?: boolean;
    demoted?: boolean;
    joinedAt?: Date;
    updatedAt?: Date;
  },
) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    const updateData: Prisma.LeaderboardEntryUpdateInput = {};

    if (typeof data.groupId === "string") {
      updateData.group = {
        connect: {
          id: data.groupId,
        },
      };
    }

    if (data.league) {
      updateData.league = data.league as PrismaLeaderboardLeague;
    }

    if (typeof data.weeklyXp === "number") {
      updateData.weeklyXp = data.weeklyXp;
    }

    if (typeof data.rank === "number" || data.rank === null) {
      updateData.rank = data.rank;
    }

    if (typeof data.lessonsCompleted === "number") {
      updateData.lessonsCompleted = data.lessonsCompleted;
    }

    if (typeof data.practicesCompleted === "number") {
      updateData.practicesCompleted = data.practicesCompleted;
    }

    if (typeof data.promoted === "boolean") {
      updateData.promoted = data.promoted;
    }

    if (typeof data.demoted === "boolean") {
      updateData.demoted = data.demoted;
    }

    if (data.joinedAt) {
      updateData.joinedAt = data.joinedAt;
    }

    if (data.updatedAt) {
      updateData.updatedAt = data.updatedAt;
    }

    const record = await prisma.leaderboardEntry.update({
      where: {
        id,
      },
      data: updateData,
    });

    return toPrismaLeaderboardEntryRecord(record);
  }

  return withFileStoreMutation(async (store) => {
    const record = store.leaderboardEntries.find((entry) => entry.id === id);

    if (!record) {
      return null;
    }

    if (typeof data.groupId === "string") {
      record.groupId = data.groupId;
    }

    if (data.league) {
      record.league = data.league;
    }

    if (typeof data.weeklyXp === "number") {
      record.weeklyXp = data.weeklyXp;
    }

    if (typeof data.rank === "number" || data.rank === null) {
      record.rank = data.rank;
    }

    if (typeof data.lessonsCompleted === "number") {
      record.lessonsCompleted = data.lessonsCompleted;
    }

    if (typeof data.practicesCompleted === "number") {
      record.practicesCompleted = data.practicesCompleted;
    }

    if (typeof data.promoted === "boolean") {
      record.promoted = data.promoted;
    }

    if (typeof data.demoted === "boolean") {
      record.demoted = data.demoted;
    }

    if (data.joinedAt) {
      record.joinedAt = data.joinedAt.toISOString();
    }

    record.updatedAt = (data.updatedAt ?? new Date()).toISOString();
    return toLeaderboardEntryRecord(record);
  });
}

export async function createLeaderboardActivityIfMissing(input: {
  entryId: string;
  userId: string;
  sourceType: LeaderboardActivitySourceType;
  sourceId: string;
  xpDelta: number;
}) {
  assertEnvLoaded();

  if (!isFileStoreEnabled()) {
    try {
      const record = await prisma.leaderboardActivity.create({
        data: toLeaderboardActivityCreateInput(input),
      });

      return {
        created: true,
        activity: toPrismaLeaderboardActivityRecord(record),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.leaderboardActivity.findUnique({
          where: {
            userId_sourceType_sourceId: {
              userId: input.userId,
              sourceType: input.sourceType as PrismaLeaderboardActivitySourceType,
              sourceId: input.sourceId,
            },
          },
        });

        return {
          created: false,
          activity: existing ? toPrismaLeaderboardActivityRecord(existing) : null,
        };
      }

      throw error;
    }
  }

  return withFileStoreMutation(async (store) => {
    const existing = store.leaderboardActivities.find(
      (entry) =>
        entry.userId === input.userId &&
        entry.sourceType === input.sourceType &&
        entry.sourceId === input.sourceId,
    );

    if (existing) {
      return {
        created: false,
        activity: toLeaderboardActivityRecord(existing),
      };
    }

    const created = {
      id: randomUUID(),
      entryId: input.entryId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      xpDelta: input.xpDelta,
      createdAt: new Date().toISOString(),
    };

    store.leaderboardActivities.push(created);
    return {
      created: true,
      activity: toLeaderboardActivityRecord(created),
    };
  });
}
