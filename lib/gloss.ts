import type { GlossQuestionType, GlossSegment } from "@/types/curriculum";

export const GLOSS_ENABLED_TYPES: GlossQuestionType[] = [
  "speaking_prompt",
  "speaking_scaffold",
  "lesson_example",
  "grammar_example",
  "vocabulary_intro",
  "dialogue_example",
  "reading_support",
  "lesson_content",
  "review_light",
];

export function isGlossEnabled(input: {
  supportsGloss?: boolean;
  questionType?: GlossQuestionType;
}) {
  return input.supportsGloss ?? GLOSS_ENABLED_TYPES.includes(input.questionType ?? "active_recall");
}

export const PROMPT_LEXICAL_GLOSSARY: Record<
  string,
  {
    meaningEn: string;
    meaningVi: string;
  }
> = {
  "저는": { meaningEn: "I", meaningVi: "tôi" },
  "저도": { meaningEn: "me too", meaningVi: "tôi cũng" },
  "학생": { meaningEn: "student", meaningVi: "học sinh" },
  "회사원": { meaningEn: "office worker", meaningVi: "nhân viên văn phòng" },
  "의사": { meaningEn: "doctor", meaningVi: "bác sĩ" },
  "지수": { meaningEn: "Jisoo", meaningVi: "Jisoo" },
  "민수": { meaningEn: "Minsu", meaningVi: "Minsu" },
  "안녕하세요": { meaningEn: "hello", meaningVi: "xin chào" },
  "반갑습니다": { meaningEn: "nice to meet you", meaningVi: "rất vui được gặp" },
};

export function getPromptGlossSegments(text?: string): GlossSegment[] {
  if (!text) {
    return [];
  }

  return Object.entries(PROMPT_LEXICAL_GLOSSARY)
    .filter(([token]) => text.includes(token))
    .map(([textKo, meanings]) => ({
      textKo,
      ...meanings,
    }))
    .sort((left, right) => text.indexOf(left.textKo) - text.indexOf(right.textKo));
}
