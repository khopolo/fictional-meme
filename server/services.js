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
function inferTransform(fieldName = "", value = "") {
  const token = `${fieldName || value}`.toUpperCase();
  if (/DATE|DAY|MONTH|YEAR/.test(token)) return "date";
  if (/AMOUNT|TOTAL|DONAT|PRICE|COST|VALUE/.test(token)) return "currency";
  return "text";
}
function applyTransform(value, transform = "text") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (transform === "currency") {
    const numeric = Number.parseFloat(String(raw).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric)) return raw;
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  if (transform === "date") {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
    }).format(parsed);
  }
  return raw;
}
function parseLiteralValue(raw, row) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^[-+]?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed in row) return row[trimmed];
  return trimmed;
}
function resolveCondition(row, condition) {
  const text = String(condition || "").trim();
  if (!text) return true;
  const directField = /^(?:[A-Za-z0-9_ ]+)$/.test(text) ? text : null;
  if (directField) return Boolean(row[directField] ?? row[directField.trim()]);
  const match = text.match(/^(.+?)\s*(==|!=|>=|<=|>|<| contains | in )\s*(.+)$/i);
  if (!match) return Boolean(parseLiteralValue(text, row));
  const [, left, operator, rightRaw] = match;
  const leftValue = parseLiteralValue(left, row);
  const rightValue = parseLiteralValue(rightRaw, row);
  switch (operator.trim().toLowerCase()) {
    case "==": return leftValue == rightValue;
    case "!=": return leftValue != rightValue;
    case ">=": return Number(leftValue) >= Number(rightValue);
    case "<=": return Number(leftValue) <= Number(rightValue);
    case ">": return Number(leftValue) > Number(rightValue);
    case "<": return Number(leftValue) < Number(rightValue);
    case "contains":
      return String(leftValue).toLowerCase().includes(String(rightValue).toLowerCase());
    case "in":
      return String(rightValue).toLowerCase().split(/[|,]/).includes(String(leftValue).toLowerCase());
    default: return Boolean(leftValue);
  }
}
function resolveConditionalValue(row, source) {
  const match = source.match(/^IF\s+(.+?)\s+THEN\s+(.+?)(?:\s+ELSE\s+(.+))?$/i);
  if (!match) return null;
  const [, condition, whenTrue, whenFalse = ""] = match;
  const outcome = resolveCondition(row, condition) ? whenTrue : whenFalse;
  return outcome ? outcome.trim() : "";
}
export function mappedValue(row, expression, fieldName = "") {
  const source = String(expression || "").trim();
  if (!source) return "";
  const conditional = resolveConditionalValue(row, source);
  if (conditional !== null) {
    const result = parseLiteralValue(conditional, row);
    return typeof result === "string" ? result : String(result ?? "");
  }
  const [rawExpression, transformName] = source.split(/\s*\|\s*/);
  const rawValue = String(rawExpression)
    .split(" + ")
    .map((c) => row[c] ?? "")
    .join(" ")
    .trim();
  const transform =
    transformName || inferTransform(fieldName || rawExpression, rawValue);
  return applyTransform(rawValue, transform);
}
export function normaliseSignatureDrawOptions(signature = {}) {
  const candidate =
    signature && typeof signature === "object" && !Buffer.isBuffer(signature)
      ? signature
      : {};
  const scale = Number(candidate.scale ?? 1);
  const opacity = Number(candidate.opacity ?? 0.9);
  const rotation = Number(candidate.rotation ?? 0);
  const width = Number(candidate.width ?? 120);
  const height = Number(candidate.height ?? 40);
  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    opacity: Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 0.9,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    width: Number.isFinite(width) && width > 0 ? width : 120,
    height: Number.isFinite(height) && height > 0 ? height : 40,
    printName: candidate.printName ?? true,
    printDate: candidate.printDate ?? false,
    name: candidate.name || "Signature",
  };
}
export async function generatePDF(
  template,
  sourcePath,
  row,
  mappings,
  signatureValue,
) {
  let signatureBytes = null;
  let signatureOptions = normaliseSignatureDrawOptions();
  if (signatureValue && typeof signatureValue === "object") {
    if (Buffer.isBuffer(signatureValue)) {
      signatureBytes = signatureValue;
    } else {
      signatureBytes =
        signatureValue.bytes || signatureValue.image || signatureValue.data || null;
      signatureOptions = normaliseSignatureDrawOptions(
        signatureValue.options || signatureValue,
      );
    }
  } else if (signatureValue) {
    signatureBytes = signatureValue;
  }
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
        const drawWidth = (Number(f.width) || signatureOptions.width || 120) * signatureOptions.scale;
        const drawHeight = (Number(f.height) || signatureOptions.height || 40) * signatureOptions.scale;
        page.drawImage(img, {
          x,
          y: y - drawHeight,
          width: drawWidth,
          height: drawHeight,
          opacity: Number(f.opacity ?? signatureOptions.opacity ?? 0.9),
          rotate: degrees(Number(f.rotation ?? signatureOptions.rotation ?? 0)),
        });
        const textLines = [];
        if (signatureOptions.printName !== false) {
          textLines.push(String(signatureOptions.name || "Signature"));
        }
        if (signatureOptions.printDate) {
          textLines.push(
            new Date().toLocaleDateString("en-ZA", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          );
        }
        let currentY = y - drawHeight - 10;
        for (const line of textLines) {
          page.drawText(line, {
            x: x + 2,
            y: currentY,
            size: 10,
            font,
            color: rgb(0.09, 0.12, 0.2),
            maxWidth: drawWidth,
          });
          currentY -= 12;
        }
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
