import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestMappings,
  mappedValue,
  generatePDF,
  compareDocuments,
  extractRequirements,
} from "../server/services.js";
import { PDFDocument, PDFName } from "pdf-lib";
import { PDFParse } from "pdf-parse";
test("mapping combines names, preserves missing values and maps donations", () => {
  const m = suggestMappings(
    ["First Name", "Surname", "Donation"],
    [{ name: "FULL_NAME" }, { name: "AMOUNT" }, { name: "Unknown" }],
  );
  assert.equal(m.FULL_NAME, "First Name + Surname");
  assert.equal(m.AMOUNT, "Donation");
  assert.equal(m.Unknown, "");
  assert.equal(
    mappedValue({ "First Name": "John", Surname: "Smith" }, m.FULL_NAME),
    "John Smith",
  );
  assert.equal(mappedValue({}, "Missing"), "");
});
test("100 PDFs contain the correct unique recipient and signature resource", async () => {
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=",
    "base64",
  );
  for (let i = 0; i < 100; i++) {
    const bytes = await generatePDF(
      {
        fields: [
          { name: "FULL_NAME", x: 30, y: 50, size: 24 },
          { name: "SIGNATURE", x: 70, y: 80 },
        ],
      },
      null,
      { name: "Donor " + i },
      { FULL_NAME: "name" },
      signature,
    );
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    assert.ok(doc.getPage(0).node.Resources().lookup(PDFName.of("XObject")));
    const parser = new PDFParse({ data: bytes });
    try {
      assert.match(
        (await parser.getText()).text,
        new RegExp("Donor " + i + "\\b"),
      );
    } finally {
      await parser.destroy();
    }
  }
});
test("comparison preserves actual additions and removals", () => {
  const changes = compareDocuments(
    "Amount: 100\nClosing: June\n",
    "Amount: 200\nClosing: June\n",
  );
  assert.ok(
    changes.some((c) => c.type === "removed" && c.text.includes("100")),
  );
  assert.ok(changes.some((c) => c.type === "added" && c.text.includes("200")));
});
test("tender extractor retains source language and flags manual review", () => {
  const r = extractRequirements(
    "Welcome\nTax certificate is mandatory.\nSubmit before Friday.",
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].status, "Manual review");
  assert.equal(r[0].text, "Tax certificate is mandatory.");
});
