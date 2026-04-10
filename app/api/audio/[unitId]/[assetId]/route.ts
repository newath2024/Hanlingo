import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { SourceUnit } from "@/types/curriculum";
import { openRemoteAudioStream } from "@/lib/remote-audio";

type RouteContext = {
  params: Promise<{
    unitId: string;
    assetId: string;
  }>;
};

async function loadReviewedSource(unitId: string) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "curriculum",
    "source",
    `unit-${unitId}.reviewed.json`,
  );
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as SourceUnit;
}

export async function GET(_: Request, context: RouteContext) {
  const { unitId, assetId } = await context.params;
  const source = await loadReviewedSource(unitId);
  const asset = source.workbook.audioAssets.find((entry) => entry.id === assetId);

  if (!asset?.remoteUrl) {
    return new Response("Audio asset not found.", { status: 404 });
  }

  try {
    const remote = await openRemoteAudioStream(asset.remoteUrl);
    const contentType = remote.response.headers["content-type"];
    const mimeType = Array.isArray(contentType) ? contentType[0] : contentType;

    return new Response(Readable.toWeb(remote.response) as BodyInit, {
      status: remote.response.statusCode ?? 200,
      headers: {
        "Content-Type": mimeType ?? "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Failed to stream audio.", { status: 502 });
  }
}
