import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_TTS_MODEL: z.string().min(1).optional(),
  OPENAI_TTS_KO_VOICE: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  HANLINGO_DEV_FILE_STORE: z.enum(["true", "false"]).optional(),
});

let parsedEnv: z.infer<typeof envSchema> | null = null;

export function getServerEnv() {
  if (parsedEnv) {
    return parsedEnv;
  }

  parsedEnv = envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
    OPENAI_TTS_KO_VOICE: process.env.OPENAI_TTS_KO_VOICE,
    SESSION_SECRET: process.env.SESSION_SECRET,
    SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
    HANLINGO_DEV_FILE_STORE: process.env.HANLINGO_DEV_FILE_STORE,
  });

  return parsedEnv;
}
