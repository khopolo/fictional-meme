import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
export function donorImage() {
  const canvas = createCanvas(1600, 450),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 1600, 450);
  ctx.fillStyle = "black";
  ctx.font = "48px sans-serif";
  [
    "DONOR NAME: JOHN SMITH",
    "DONATION AMOUNT: R500",
    "EMAIL: john@example.org",
  ].forEach((line, i) => ctx.fillText(line, 60, 110 + i * 100));
  return canvas.toBuffer("image/png");
}
export async function mixedPDF() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = pdf.addPage([800, 450]);
  text.drawText("Company Name: Example Foundation", {
    x: 40,
    y: 360,
    size: 22,
    font,
  });
  const scanned = pdf.addPage([800, 225]),
    image = await pdf.embedPng(donorImage());
  scanned.drawImage(image, { x: 0, y: 0, width: 800, height: 225 });
  return pdf.save();
}
