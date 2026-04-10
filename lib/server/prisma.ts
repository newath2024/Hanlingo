import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/lib/server/env";

declare global {
  var __hanlingoPrisma: PrismaClient | undefined;
}

const serverEnv = getServerEnv();
const adapter = new PrismaPg({
  connectionString: serverEnv.DATABASE_URL,
});

export const prisma =
  globalThis.__hanlingoPrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__hanlingoPrisma = prisma;
}
