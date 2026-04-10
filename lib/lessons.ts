import lesson1 from "@/data/lesson1.json";
import type { LessonData } from "@/types/lesson";

export type LessonSummary = {
  id: string;
  title: string;
  subtitle: string;
  unit: number;
  lesson: LessonData;
};

const lessonMap: Record<string, LessonData> = {
  "1": lesson1 as LessonData,
};

export const lessonCatalog: LessonSummary[] = [
  {
    id: "1",
    title: "Introductions",
    subtitle: "Say hello and introduce yourself with confidence.",
    unit: lesson1.unit,
    lesson: lesson1 as LessonData,
  },
];

export function getLessonById(id: string): LessonData | null {
  return lessonMap[id] ?? null;
}

