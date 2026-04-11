import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AttemptSourceContext, ErrorType, FingerprintType, Prisma } from "@prisma/client";
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

type FileStoreShape = {
  users: Array<{
    id: string;
    email: string;
    username: string;
    passwordHash: string;
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
};

const FILE_STORE_PATH = path.join(process.cwd(), ".local-data", "dev-auth-store.json");

let writeChain = Promise.resolve();

function isFileStoreEnabled() {
  return process.env.HANLINGO_DEV_FILE_STORE === "true";
}

function toUserRecord(user: FileStoreShape["users"][number]): UserRecord {
  return {
    ...user,
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
    };
    await writeFile(FILE_STORE_PATH, JSON.stringify(emptyStore, null, 2), "utf8");
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
  };
}

async function readFileStore(): Promise<FileStoreShape> {
  await ensureFileStore();
  const raw = await readFile(FILE_STORE_PATH, "utf8");
  return normalizeFileStoreShape(JSON.parse(raw));
}

async function writeFileStore(store: FileStoreShape) {
  await writeFile(FILE_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function withFileStoreMutation<T>(mutator: (store: FileStoreShape) => T | Promise<T>) {
  let result!: T;

  writeChain = writeChain.then(async () => {
    const store = await readFileStore();
    result = await mutator(store);
    await writeFileStore(store);
  });

  await writeChain;
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
