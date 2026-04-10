import fs from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfRole = "textbook" | "workbook";

export type PdfInspection = {
  role: PdfRole;
  fileName: string;
  totalPages: number;
  textPagesDetected: number;
  hasTextLayer: boolean;
};

function normalizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getPdfRole(fileName: string): PdfRole | null {
  const normalized = normalizeFileName(fileName);

  if (normalized.includes("sach bai tap")) {
    return "workbook";
  }

  if (normalized.includes("giao trinh")) {
    return "textbook";
  }

  return null;
}

export async function resolvePdfFiles(cwd: string) {
  const entries = await fs.readdir(cwd);
  const pdfFiles = entries.filter((entry) => entry.endsWith(".pdf"));

  const resolved = pdfFiles.reduce<Partial<Record<PdfRole, string>>>((accumulator, fileName) => {
    const role = getPdfRole(fileName);

    if (role) {
      accumulator[role] = fileName;
    }

    return accumulator;
  }, {});

  if (!resolved.textbook || !resolved.workbook) {
    throw new Error(
      `Could not resolve both PDFs. Found: ${pdfFiles.join(", ") || "(none)"}`,
    );
  }

  return {
    textbook: path.join(cwd, resolved.textbook),
    workbook: path.join(cwd, resolved.workbook),
  };
}

export async function inspectPdf(role: PdfRole, filePath: string): Promise<PdfInspection> {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await getDocument({ data }).promise;
  let textPagesDetected = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const joinedText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("")
      .trim();

    if (joinedText.length > 0) {
      textPagesDetected += 1;
    }
  }

  return {
    role,
    fileName: path.basename(filePath),
    totalPages: pdf.numPages,
    textPagesDetected,
    hasTextLayer: textPagesDetected > 0,
  };
}
