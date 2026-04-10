import fs from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawSourceBlock, SourceBlockKind, SourceDocumentRole } from "@/types/curriculum";

type VisionBlockPayload = {
  text?: string;
  kind?: SourceBlockKind;
  confidence?: number;
};

type VisionResponse = {
  blocks?: VisionBlockPayload[];
};

function extractJsonPayload(value: string) {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fencedMatch) {
    return fencedMatch[1];
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return value.slice(firstBrace, lastBrace + 1);
}

async function renderPageImage(pdfPath: string, pageNumber: number) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  }).promise;

  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

async function ocrPageWithOpenAI(
  imageUrl: string,
  document: SourceDocumentRole,
  pageNumber: number,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You OCR Korean textbook/workbook pages. Return JSON only with shape {\"blocks\":[{\"text\":\"...\",\"kind\":\"exercise|dialogue|vocab|grammar|example|unknown\",\"confidence\":0.0}]} . Split numbered items, blanks, headers, and short exercise prompts into separate atomic blocks.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Document=${document}; page=${pageNumber}. Extract short OCR blocks.`,
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { output_text?: string };
  const jsonCandidate = payload.output_text ? extractJsonPayload(payload.output_text) : null;
  if (!jsonCandidate) {
    return null;
  }

  return JSON.parse(jsonCandidate) as VisionResponse;
}

export async function maybeExtractVisionBlocks(options: {
  pdfPath: string;
  document: SourceDocumentRole;
  startPage: number;
  endPage: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const blocks: RawSourceBlock[] = [];

  for (let page = options.startPage; page <= options.endPage; page += 1) {
    try {
      const imageUrl = await renderPageImage(options.pdfPath, page);
      const result = await ocrPageWithOpenAI(imageUrl, options.document, page);
      if (!result?.blocks?.length) {
        continue;
      }

      result.blocks.forEach((block, index) => {
        const text = block.text?.trim();
        if (!text) {
          return;
        }

        blocks.push({
          id: `${options.document}-ocr-p${page}-${index + 1}`,
          document: options.document,
          page,
          kind: block.kind ?? "unknown",
          text,
          confidence:
            typeof block.confidence === "number"
              ? Math.max(0, Math.min(1, block.confidence))
              : 0.6,
          needsReview: typeof block.confidence === "number" ? block.confidence < 0.85 : true,
        });
      });
    } catch {
      return null;
    }
  }

  return blocks.length > 0 ? blocks : null;
}
