import { Readable } from "node:stream";
import { openRemoteAudioStream } from "@/lib/remote-audio";
import { loadReviewedSourceUnit } from "@/lib/server/curriculum-source";

type RouteContext = {
  params: Promise<{
    unitId: string;
    assetId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { unitId, assetId } = await context.params;
  const source = await loadReviewedSourceUnit(unitId);
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
