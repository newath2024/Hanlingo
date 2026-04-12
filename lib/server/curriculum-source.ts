import fs from "node:fs/promises";
import path from "node:path";
import type { SourceUnit } from "@/types/curriculum";

export async function loadReviewedSourceUnit(unitId: string) {
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
