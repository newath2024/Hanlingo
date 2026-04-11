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
    // Use a direct connection for Prisma CLI when available.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      defaultLocalDatabaseUrl,
  },
});
