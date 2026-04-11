import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultLocalDatabaseUrl =
  "postgresql://hanlingo:hanlingo@localhost:5432/hanlingo?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer the main database URL for Prisma CLI, with DIRECT_URL as a fallback.
    url:
      process.env.DATABASE_URL ??
      process.env.DIRECT_URL ??
      defaultLocalDatabaseUrl,
  },
});
