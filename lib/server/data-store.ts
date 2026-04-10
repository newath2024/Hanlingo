import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { createDefaultUserProgressState } from "@/lib/progress-state";
import { getServerEnv } from "@/lib/server/env";
import { prisma } from "@/lib/server/prisma";

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
  nodeRuns: unknown;
  errorPatternMisses: unknown;
  reviews: unknown;
  sentenceExposures: unknown;
  importedFromLocalAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
    nodeRuns: unknown;
    errorPatternMisses: unknown;
    reviews: unknown;
    sentenceExposures: unknown;
    importedFromLocalAt: string | null;
    createdAt: string;
    updatedAt: string;
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
    };
    await writeFile(FILE_STORE_PATH, JSON.stringify(emptyStore, null, 2), "utf8");
  }
}

async function readFileStore(): Promise<FileStoreShape> {
  await ensureFileStore();
  const raw = await readFile(FILE_STORE_PATH, "utf8");
  return JSON.parse(raw) as FileStoreShape;
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
