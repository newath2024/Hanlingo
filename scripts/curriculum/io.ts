import fs from "node:fs/promises";
import path from "node:path";

export const CURRICULUM_ROOT = path.join(process.cwd(), "data", "curriculum");
export const SOURCE_OUTPUT_DIR = path.join(CURRICULUM_ROOT, "source");
export const GENERATED_OUTPUT_DIR = path.join(process.cwd(), "data", "generated");
export const PUBLIC_GENERATED_DIR = path.join(process.cwd(), "public", "generated");

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export async function readJsonFile<T>(filePath: string) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function getExtractedSourcePath(unitId: string) {
  return path.join(SOURCE_OUTPUT_DIR, `unit-${unitId}.extracted.json`);
}

export function getRawDraftPath(unitId: string) {
  return path.join(SOURCE_OUTPUT_DIR, `unit-${unitId}.raw-draft.json`);
}

export function getReviewedSourcePath(unitId: string) {
  return path.join(SOURCE_OUTPUT_DIR, `unit-${unitId}.reviewed.json`);
}

export function getRuntimeUnitPath(unitId: string) {
  return path.join(GENERATED_OUTPUT_DIR, `unit-${unitId}.runtime.json`);
}

export function getExerciseSetPath(unitId: string) {
  return path.join(GENERATED_OUTPUT_DIR, `unit-${unitId}.exercise-set.json`);
}

export function getGeneratedIndexPath() {
  return path.join(GENERATED_OUTPUT_DIR, "index.json");
}
