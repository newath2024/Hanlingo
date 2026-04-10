import type { RuntimeUnit } from "@/types/curriculum";

type OpenAIEnhanceOptions = {
  localOnly: boolean;
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

export async function maybeEnhanceRuntimeUnitWithOpenAI(
  runtimeUnit: RuntimeUnit,
  options: OpenAIEnhanceOptions,
) {
  if (options.localOnly) {
    return runtimeUnit;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return runtimeUnit;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  try {
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
                text: "You refine bilingual Korean-learning curriculum JSON. Preserve every id, answer, lesson count, task order, Korean text, grammar tags, srWeight, errorPatternKey, and task type. Only improve Vietnamese and English prompt, supportText, explanation, title, subtitle, and summary wording. Return JSON only.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(runtimeUnit),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return runtimeUnit;
    }

    const payload = (await response.json()) as ResponsesApiOutput;
    const jsonCandidate = payload.output_text
      ? extractJsonPayload(payload.output_text)
      : null;

    if (!jsonCandidate) {
      return runtimeUnit;
    }

    return JSON.parse(jsonCandidate) as RuntimeUnit;
  } catch {
    return runtimeUnit;
  }
}
