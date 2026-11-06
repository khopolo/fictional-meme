import fs from "node:fs/promises";
import XLSX from "xlsx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { PDFDocument } from "pdf-lib";
import { createWorker } from "tesseract.js";

function limit(name, fallback, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
export function textSegments(text, location = {}) {
  return text
    .split(/\r?\n/)
    .flatMap((text, index) =>
      text.trim()
        ? [
            {
              id: `${location.page ? "p" + location.page : location.sheet ? "s" + location.sheet + "r" + location.row : "text"}-l${index + 1}`,
              text: text.trim(),
              line: index + 1,
              ...location,
            },
          ]
        : [],
    );
}
// OCR runs one document at a time to bound native worker memory.
let ocrTail = Promise.resolve();
async function withOCR(work) {
  let release;
  const previous = ocrTail;
  ocrTail = new Promise((r) => (release = r));
  await previous;
  let worker;
  try {
    worker = await createWorker("eng", 1, {
      cachePath: process.env.OCR_CACHE_DIR || process.env.DATA_DIR || ".data",
    });
    return await work(worker);
  } finally {
    try {
      if (worker) await worker.terminate();
    } finally {
      release();
    }
  }
}
async function recognise(worker, bytes, location) {
  const { data } = await worker.recognize(bytes);
  const confidence = Number.isFinite(data.confidence)
    ? data.confidence / 100
    : null;
  return {
    text: data.text,
    segments: textSegments(data.text, {
      ...location,
      method: "ocr",
      confidence,
    }),
    confidence,
  };
}
export async function parseDocument(input, ext) {
  const bytes = typeof input === "string" ? await fs.readFile(input) : input;
  if (["xlsx", "xls", "csv"].includes(ext)) {
    const book = XLSX.read(bytes, { type: "buffer", cellDates: true });
    const records = book.SheetNames.flatMap((sheet) =>
      XLSX.utils
        .sheet_to_json(book.Sheets[sheet], { defval: "" })
        .map((r, i) => ({
          ...r,
          _source_sheet: sheet,
          _source_row: (r.__rowNum__ ?? i + 1) + 1,
        })),
    );
    if (records.length > 50000)
      throw new Error("Spreadsheet exceeds the 50,000 record processing limit");
    return {
      text: book.SheetNames.map((s) =>
        XLSX.utils.sheet_to_csv(book.Sheets[s]),
      ).join("\n"),
      records,
      segments: records.map((r, i) => ({
        id: "row-" + i,
        text: Object.entries(r)
          .filter(([k]) => !k.startsWith("_"))
          .map(([k, v]) => `${k}: ${v}`)
          .join("\t"),
        sheet: r._source_sheet,
        row: r._source_row,
        method: "spreadsheet",
        confidence: null,
      })),
      processing: { method: "spreadsheet", ocrPages: 0 },
    };
  }
  if (ext === "pdf") {
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    if (pages.length > limit("MAX_PDF_PAGES", 100, 500))
      throw new Error("PDF exceeds the configured page limit");
    const parser = new PDFParse({ data: bytes });
    try {
      const extracted = await parser.getText({ pageJoiner: "" });
      const byPage = new Map(extracted.pages.map((p) => [p.num, p.text]));
      // A page without meaningful text gets OCR even when other pages have text.
      const scanned = pages
        .map((_, i) => i + 1)
        .filter((n) => !/[\p{L}\p{N}]/u.test(byPage.get(n) || ""));
      if (scanned.length > limit("MAX_OCR_PAGES", 20, 100))
        throw new Error(
          "Scanned pages exceed the configured OCR limit. Split this PDF into smaller files.",
        );
      const results = new Map();
      if (scanned.length)
        await withOCR(async (worker) => {
          for (const num of scanned) {
            const { width, height } = pages[num - 1].getSize();
            if (
              width <= 0 ||
              height <= 0 ||
              height / width > 10 ||
              width / height > 10
            )
              throw new Error(`Page ${num} has unsupported dimensions for OCR`);
            const desiredWidth = Math.floor(
              Math.min(1600, Math.sqrt((6000000 * width) / height)),
            );
            const screenshot = await parser.getScreenshot({
              partial: [num],
              desiredWidth,
              imageBuffer: true,
              imageDataUrl: false,
            });
            results.set(
              num,
              await recognise(worker, screenshot.pages[0].data, { page: num }),
            );
          }
        });
      const segments = pages.flatMap(
        (_, i) =>
          results.get(i + 1)?.segments ||
          textSegments(byPage.get(i + 1) || "", {
            page: i + 1,
            method: "pdf-text",
            confidence: null,
          }),
      );
      const text = pages
        .map((_, i) => results.get(i + 1)?.text || byPage.get(i + 1) || "")
        .join("\n\n");
      if (!text.trim())
        throw new Error(
          "No readable text found. Upload a clearer scan or image.",
        );
      return {
        text,
        records: [],
        segments,
        processing: {
          method: scanned.length ? "pdf-with-ocr" : "pdf-text",
          pages: pages.length,
          ocrPages: scanned.length,
        },
      };
    } finally {
      await parser.destroy();
    }
  }
  if (["png", "jpg", "jpeg"].includes(ext)) {
    const result = await withOCR((worker) =>
      recognise(worker, bytes, { page: 1 }),
    );
    if (!result.text.trim())
      throw new Error("No readable text found in this image");
    return {
      ...result,
      records: [],
      processing: { method: "ocr", pages: 1, ocrPages: 1 },
    };
  }
  const text =
    ext === "docx"
      ? (await mammoth.extractRawText({ buffer: bytes })).value
      : bytes.toString("utf8");
  if (text.length > 2000000)
    throw new Error("Document text exceeds the processing limit");
  return {
    text,
    records: [],
    segments: textSegments(text, {
      method: ext === "docx" ? "word-text" : "text",
      confidence: null,
    }),
    processing: { method: ext === "docx" ? "word-text" : "text", ocrPages: 0 },
  };
}
