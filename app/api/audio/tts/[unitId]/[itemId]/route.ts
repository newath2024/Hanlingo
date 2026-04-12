import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ListeningTtsVoice, SourceListeningItem } from "@/types/curriculum";
import { loadReviewedSourceUnit } from "@/lib/server/curriculum-source";
import { getServerEnv } from "@/lib/server/env";

type RouteContext = {
  params: Promise<{
    unitId: string;
    itemId: string;
  }>;
};

const TTS_CACHE_ROOT = path.join(process.cwd(), ".cache", "tts");

function getListeningItemById(
  items: SourceListeningItem[],
  itemId: string,
) {
  return items.find((item) => item.id === itemId);
}

function resolveProviderVoice(
  ttsVoice: ListeningTtsVoice,
  options: {
    defaultVoice?: string;
    maleVoice?: string;
    femaleVoice?: string;
  },
) {
  if (ttsVoice === "male") {
    return options.maleVoice ?? options.defaultVoice ?? "alloy";
  }

  if (ttsVoice === "female") {
    return options.femaleVoice ?? options.defaultVoice ?? "alloy";
  }

  return options.defaultVoice ?? "alloy";
}

function getCacheKey(
  unitId: string,
  itemId: string,
  item: NonNullable<SourceListeningItem["tts"]>,
  model: string,
  providerVoice: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        unitId,
        itemId,
        text: item.text,
        voice: item.voice,
        speed: item.speed,
        model,
        providerVoice,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function getCachePath(unitId: string, itemId: string, cacheKey: string) {
  return path.join(TTS_CACHE_ROOT, unitId, `${itemId}-${cacheKey}.mp3`);
}

async function readCachedAudio(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeCachedAudio(filePath: string, audioBuffer: Buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, audioBuffer);
}

async function synthesizeAudio(
  item: NonNullable<SourceListeningItem["tts"]>,
  model: string,
  providerVoice: string,
  apiKey: string,
) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: item.text,
      voice: providerVoice,
      speed: item.speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false as const,
      message: errorText || "Failed to synthesize TTS audio.",
    };
  }

  return {
    ok: true as const,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

export const runtime = "nodejs";

export async function GET(_: Request, context: RouteContext) {
  const { unitId, itemId } = await context.params;
  const source = await loadReviewedSourceUnit(unitId);
  const item = getListeningItemById(source.workbook.listeningItems ?? [], itemId);
  const ttsConfig = item?.tts;

  if (!ttsConfig) {
    return new Response("TTS listening item not found.", { status: 404 });
  }

  const env = getServerEnv();

  if (!env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY is not configured.", { status: 503 });
  }

  const model = env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
  const providerVoice = resolveProviderVoice(ttsConfig.voice, {
    defaultVoice: env.OPENAI_TTS_KO_VOICE,
    maleVoice: env.OPENAI_TTS_KO_MALE_VOICE,
    femaleVoice: env.OPENAI_TTS_KO_FEMALE_VOICE,
  });
  const cacheKey = getCacheKey(unitId, itemId, ttsConfig, model, providerVoice);
  const cachePath = getCachePath(unitId, itemId, cacheKey);
  const cachedAudio = await readCachedAudio(cachePath);

  if (cachedAudio) {
    return new Response(cachedAudio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const synthesized = await synthesizeAudio(ttsConfig, model, providerVoice, env.OPENAI_API_KEY);

  if (!synthesized.ok) {
    return new Response(synthesized.message, { status: 502 });
  }

  await writeCachedAudio(cachePath, synthesized.buffer);

  return new Response(synthesized.buffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
