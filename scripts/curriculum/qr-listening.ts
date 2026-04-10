import fs from "node:fs/promises";
import path from "node:path";
import { Canvas, createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { downloadRemoteBuffer, resolveRemoteAsset } from "@/lib/remote-audio";
import type {
  RawDraftPageIssue,
  RawImageCrop,
  RawQrDetection,
  SourceAudioAsset,
  SourceBounds,
} from "@/types/curriculum";
import { PUBLIC_GENERATED_DIR, ensureDir } from "./io";
import type { SeededQrImageCrop } from "./qr-seed";

type RenderedPage = {
  canvas: Canvas;
  width: number;
  height: number;
};

type ExtractWorkbookListeningArtifactsOptions = {
  pdfPath: string;
  audioAssets: SourceAudioAsset[];
  listeningPages: readonly number[];
  imageCropSeeds?: readonly SeededQrImageCrop[];
};

function getCandidateQrRegions(width: number, height: number): SourceBounds[] {
  const yStarts = [0.04, 0.18, 0.32, 0.46, 0.6];
  const regionHeights = [0.18, 0.22];
  const xStarts = [0.62, 0.68, 0.74];
  const regionWidths = [0.18, 0.22, 0.26];
  const regions: SourceBounds[] = [
    { x: 0, y: 0, width, height },
  ];

  xStarts.forEach((xStart) => {
    regionWidths.forEach((regionWidth) => {
      yStarts.forEach((yStart) => {
        regionHeights.forEach((regionHeight) => {
          regions.push({
            x: width * xStart,
            y: height * yStart,
            width: width * regionWidth,
            height: height * regionHeight,
          });
        });
      });
    });
  });

  return regions;
}

function clampBounds(bounds: SourceBounds, width: number, height: number): SourceBounds {
  const x = Math.max(0, Math.min(bounds.x, width - 1));
  const y = Math.max(0, Math.min(bounds.y, height - 1));
  const normalizedWidth = Math.max(1, Math.min(bounds.width, width - x));
  const normalizedHeight = Math.max(1, Math.min(bounds.height, height - y));

  return {
    x,
    y,
    width: normalizedWidth,
    height: normalizedHeight,
  };
}

function qrBoundsFromLocation(
  cropBounds: SourceBounds,
  location: NonNullable<ReturnType<typeof jsQR>>["location"],
): SourceBounds {
  const xs = [
    location.topLeftCorner.x,
    location.topRightCorner.x,
    location.bottomLeftCorner.x,
    location.bottomRightCorner.x,
  ];
  const ys = [
    location.topLeftCorner.y,
    location.topRightCorner.y,
    location.bottomLeftCorner.y,
    location.bottomRightCorner.y,
  ];

  const minX = Math.min(...xs) + cropBounds.x;
  const minY = Math.min(...ys) + cropBounds.y;
  const maxX = Math.max(...xs) + cropBounds.x;
  const maxY = Math.max(...ys) + cropBounds.y;

  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

async function renderPage(pdfPath: string, pageNumber: number, scale = 2): Promise<RenderedPage> {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  }).promise;

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
  };
}

function extractQrDetectionsForPage(
  renderedPage: RenderedPage,
  pageNumber: number,
): RawQrDetection[] {
  const context = renderedPage.canvas.getContext("2d");
  const detections = new Map<string, RawQrDetection>();

  getCandidateQrRegions(renderedPage.width, renderedPage.height).forEach((candidate, index) => {
    const bounds = clampBounds(candidate, renderedPage.width, renderedPage.height);
    const imageData = context.getImageData(
      Math.floor(bounds.x),
      Math.floor(bounds.y),
      Math.floor(bounds.width),
      Math.floor(bounds.height),
    );
    const detection = jsQR(imageData.data, imageData.width, imageData.height);

    if (!detection?.data || detections.has(detection.data)) {
      return;
    }

    detections.set(detection.data, {
      id: `workbook-p${pageNumber}-qr-${index + 1}`,
      document: "workbook",
      page: pageNumber,
      qrValue: detection.data,
      bounds: qrBoundsFromLocation(bounds, detection.location),
      needsReview: false,
    });
  });

  return Array.from(detections.values());
}

async function writeCropAsset(
  renderedPage: RenderedPage,
  crop: SeededQrImageCrop,
): Promise<RawImageCrop> {
  const bounds = clampBounds(crop.bounds, renderedPage.width, renderedPage.height);
  const outputPath = path.join(
    PUBLIC_GENERATED_DIR,
    crop.imagePath.replace(/^\//, "").replace(/^generated[\\/]/, ""),
  );
  const cropCanvas = createCanvas(Math.ceil(bounds.width), Math.ceil(bounds.height));
  const cropContext = cropCanvas.getContext("2d");

  cropContext.drawImage(
    renderedPage.canvas as never,
    Math.floor(bounds.x),
    Math.floor(bounds.y),
    Math.floor(bounds.width),
    Math.floor(bounds.height),
    0,
    0,
    Math.floor(bounds.width),
    Math.floor(bounds.height),
  );

  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, cropCanvas.toBuffer("image/png"));

  return {
    id: crop.id,
    document: "workbook",
    page: crop.page,
    label: crop.label,
    imagePath: crop.imagePath,
    bounds,
    sourceItemId: crop.sourceItemId,
    needsReview: false,
  };
}

function isAudioLikeResource(
  resource: {
    finalUrl?: string;
    remoteUrl?: string;
    mimeType?: string;
    statusCode?: number;
  } | null | undefined,
) {
  const audioUrl = resource?.finalUrl ?? resource?.remoteUrl;
  const mimeType = resource?.mimeType;
  const statusCode = resource?.statusCode;

  if (!audioUrl) {
    return false;
  }

  return Boolean(
    statusCode &&
      statusCode >= 200 &&
      statusCode < 300 &&
      (
      mimeType?.startsWith("audio/") ||
        /\.(mp3|m4a|wav|ogg)(?:$|\?)/i.test(audioUrl)
      ),
  );
}

async function maybeTranscribeRemoteAudio(remoteUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  const remoteAudio = await downloadRemoteBuffer(remoteUrl);
  const formData = new FormData();
  const mimeType = remoteAudio.mimeType ?? "audio/mpeg";
  const extension = mimeType.includes("mpeg") ? "mp3" : "audio";
  const file = new File([remoteAudio.buffer], `listening.${extension}`, {
    type: mimeType,
  });

  formData.append("file", file);
  formData.append("model", model);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ? payload.text.trim() : null;
}

export async function extractWorkbookListeningArtifacts(
  options: ExtractWorkbookListeningArtifactsOptions,
) {
  const qrDetections: RawQrDetection[] = [];
  const pageIssues: RawDraftPageIssue[] = [];
  const audioAssets = [...options.audioAssets];

  for (const page of options.listeningPages) {
    try {
      const renderedPage = await renderPage(options.pdfPath, page);
      const pageQrDetections = extractQrDetectionsForPage(renderedPage, page);

      if (pageQrDetections.length === 0) {
        pageIssues.push({
          document: "workbook",
          page,
          reason: "Expected a listening QR on this workbook page but none was decoded.",
        });
      }

      for (const detection of pageQrDetections) {
        const resolved = await resolveRemoteAsset(detection.qrValue);
        const resolvedAudio = isAudioLikeResource(resolved) ? resolved : null;

        if (resolvedAudio?.finalUrl) {
          detection.resolvedUrl = resolvedAudio.finalUrl;
        } else if (resolved?.finalUrl) {
          detection.resolvedUrl = resolved.finalUrl;
          detection.needsReview = true;
        } else {
          detection.needsReview = true;
        }

        const matchedAsset = audioAssets.find(
          (asset) => asset.page === page && asset.qrValue === detection.qrValue,
        );

        if (matchedAsset) {
          matchedAsset.remoteUrl = resolvedAudio?.finalUrl ?? matchedAsset.remoteUrl;
          matchedAsset.mimeType = resolvedAudio?.mimeType ?? matchedAsset.mimeType;

          if (!matchedAsset.transcript && resolvedAudio?.finalUrl) {
            const transcript = await maybeTranscribeRemoteAudio(resolvedAudio.finalUrl);

            if (transcript) {
              matchedAsset.transcript = transcript;
              matchedAsset.transcriptConfidence = 0.65;
            }
          }

          if (isAudioLikeResource(matchedAsset)) {
            matchedAsset.needsReview = false;
          } else {
            matchedAsset.needsReview = true;
          }
        }

        qrDetections.push(detection);
      }
    } catch {
      pageIssues.push({
        document: "workbook",
        page,
        reason: "Listening QR extraction failed for this workbook page.",
      });
    }
  }

  const cropsByPage = new Map<number, SeededQrImageCrop[]>();
  (options.imageCropSeeds ?? []).forEach((crop) => {
    const pageCrops = cropsByPage.get(crop.page) ?? [];
    pageCrops.push(crop);
    cropsByPage.set(crop.page, pageCrops);
  });
  const imageCrops: RawImageCrop[] = [];

  for (const [page, crops] of cropsByPage.entries()) {
    try {
      const renderedPage = await renderPage(options.pdfPath, page);
      const renderedCrops = await Promise.all(crops.map((crop) => writeCropAsset(renderedPage, crop)));
      imageCrops.push(...renderedCrops);
    } catch {
      pageIssues.push({
        document: "workbook",
        page,
        reason: "Listening image crop extraction failed for this workbook page.",
      });
    }
  }

  audioAssets.forEach((asset) => {
    const hasDetection = qrDetections.some(
      (detection) => detection.page === asset.page && detection.qrValue === asset.qrValue,
    );

    if (!hasDetection || !isAudioLikeResource(asset)) {
      asset.needsReview = true;
    } else {
      asset.needsReview = false;
    }
  });

  return {
    audioAssets,
    qrDetections,
    imageCrops,
    pageIssues,
  };
}
