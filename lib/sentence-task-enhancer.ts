import type { LocalizedText } from "@/types/curriculum";

type SentenceTaskEnhancementInput = {
  sentenceKr: string;
  meaning: LocalizedText;
  chunks: string[];
  blankIndex?: number;
  correctChunk?: string;
  distractorPool?: string[];
};

type SentenceTaskEnhancementOptions = {
  localOnly?: boolean;
  model?: string;
};

export type SentenceTaskEnhancementResult = {
  distractors: string[];
  explanation?: LocalizedText;
};

type ResponsesApiOutput = {
  output_text?: string;
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

export async function maybeEnhanceSentenceTask(
  input: SentenceTaskEnhancementInput,
  options: SentenceTaskEnhancementOptions = {},
): Promise<SentenceTaskEnhancementResult | null> {
  if (options.localOnly) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You generate Korean-learning distractors. Keep the provided sentence, chunk boundaries, blank index, and correct answer unchanged. Return JSON only with distractors (exactly two wrong Korean chunks) and an optional short bilingual explanation in {en,vi}. Never repeat the correct chunk or any existing sentence chunk.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(input),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ResponsesApiOutput;
    const jsonCandidate = payload.output_text
      ? extractJsonPayload(payload.output_text)
      : null;

    if (!jsonCandidate) {
      return null;
    }

    const parsed = JSON.parse(jsonCandidate) as Partial<SentenceTaskEnhancementResult>;

    if (!Array.isArray(parsed.distractors) || parsed.distractors.length < 2) {
      return null;
    }

    return {
      distractors: parsed.distractors.slice(0, 2).filter((value) => value.trim()),
      explanation:
        parsed.explanation &&
        typeof parsed.explanation.en === "string" &&
        typeof parsed.explanation.vi === "string"
          ? parsed.explanation
          : undefined,
    };
  } catch {
    return null;
  }
}
