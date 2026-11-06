import fs from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { diffLines } from "diff";

export { parseDocument } from "./parsing.js";
export function suggestMappings(columns, fields) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Object.fromEntries(
    fields.map((f) => {
      const n = norm(f.name);
      let col =
        columns.find((c) => norm(c) === n) ||
        columns.find((c) => n.includes(norm(c)) || norm(c).includes(n));
      if (n === "fullname") {
        const first = columns.find((c) =>
          /^(firstname|first|name)$/.test(norm(c)),
        );
        const last = columns.find((c) => /^(surname|lastname)$/.test(norm(c)));
        if (first && last) col = first + " + " + last;
      }
      if (!col && /amount/.test(n))
        col = columns.find((c) => /donation|amount|total/i.test(c));
      return [f.name, col || ""];
    }),
  );
}
export function mappedValue(row, expression) {
  return String(expression || "")
    .split(" + ")
    .map((c) => row[c] ?? "")
    .join(" ")
    .trim();
}
export async function generatePDF(
  template,
  sourcePath,
  row,
  mappings,
  signatureBytes,
) {
  const doc = sourcePath
    ? await PDFDocument.load(
        typeof sourcePath === "string"
          ? await fs.readFile(sourcePath)
          : sourcePath,
      )
    : await PDFDocument.create();
  if (!doc.getPageCount()) doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const f of template.fields || []) {
    const page = doc.getPages()[Number(f.page) || 0];
    if (!page) throw new Error("Template page does not exist");
    const { width, height } = page.getSize();
    const x = (Number(f.x) / 100) * width;
    const y = height - (Number(f.y) / 100) * height;
    if (f.name === "SIGNATURE") {
      if (signatureBytes) {
        const img = await doc.embedPng(signatureBytes);
        page.drawImage(img, {
          x,
          y: y - 40,
          width: Number(f.width) || 120,
          height: 40,
          opacity: 0.9,
          rotate: degrees(Number(f.rotation) || 0),
        });
      }
      continue;
    }
    const value = mappedValue(row, mappings[f.name]) || f.default || "";
    page.drawText(value, {
      x,
      y,
      size: Number(f.size) || 20,
      font,
      color: rgb(0.09, 0.12, 0.2),
      maxWidth: width - x - 15,
    });
  }
  const bytes = await doc.save();
  const check = await PDFDocument.load(bytes);
  if (!check.getPageCount()) throw new Error("Output verification failed");
  return bytes;
}
export function compareDocuments(a, b) {
  return diffLines(a, b).map((p) => ({
    type: p.added ? "added" : p.removed ? "removed" : "unchanged",
    text: p.value,
  }));
}
export function extractRequirements(text) {
  return text
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) =>
      /must|required|mandatory|closing|deadline|eligib|certificate|submit|evaluation|disqualif/i.test(
        s,
      ),
    )
    .map((text, i) => ({
      id: String(i),
      text,
      status: "Manual review",
      source: "Extracted source text",
    }));
}
