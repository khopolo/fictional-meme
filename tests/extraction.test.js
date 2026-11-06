import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import XLSX from "xlsx";
import { parseDocument } from "../server/parsing.js";
import {
  extractLabelledFields,
  validateAIFields,
  extractWithAI,
  reviewedRecord,
} from "../server/extraction.js";
import { createProcessingQueue } from "../server/processing-queue.js";
import { mixedPDF, donorImage } from "./fixtures.js";
test("mixed PDF retains digital text, recognises scanned page and cites actual pages", async () => {
  const parsed = await parseDocument(await mixedPDF(), "pdf");
  assert.equal(parsed.processing.pages, 2);
  assert.equal(parsed.processing.ocrPages, 1);
  assert.ok(
    parsed.segments.some(
      (s) =>
        s.page === 1 &&
        s.method === "pdf-text" &&
        s.text.includes("Example Foundation"),
    ),
  );
  assert.ok(
    parsed.segments.some(
      (s) =>
        s.page === 2 && s.method === "ocr" && s.text.includes("JOHN SMITH"),
    ),
  );
  const fields = extractLabelledFields(parsed);
  assert.equal(fields.find((f) => f.name === "FULL_NAME").value, "JOHN SMITH");
  const donation = fields.find((f) => f.name === "DONATION_AMOUNT");
  assert.equal(donation.value, "R500");
  assert.equal(donation.source.page, 2);
  assert.ok(donation.ocrConfidence >= 0 && donation.ocrConfidence <= 1);
  assert.equal(donation.reviewRequired, true);
});
test("image OCR performs real recognition and no longer returns an empty successful document", async () => {
  const parsed = await parseDocument(donorImage(), "png");
  assert.match(parsed.text, /JOHN SMITH/);
  assert.equal(parsed.processing.method, "ocr");
});
test("OCR limit stops oversized scanned batches before recognition", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const previous = process.env.MAX_OCR_PAGES;
  process.env.MAX_OCR_PAGES = "1";
  try {
    await assert.rejects(parseDocument(await pdf.save(), "pdf"), /OCR limit/);
  } finally {
    if (previous === undefined) delete process.env.MAX_OCR_PAGES;
    else process.env.MAX_OCR_PAGES = previous;
  }
});
test("spreadsheet provenance preserves physical row numbers across blank rows", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["Name"], ["Alice"], [], ["Bob"]]),
    "People",
  );
  const parsed = await parseDocument(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    "xlsx",
  );
  assert.deepEqual(
    parsed.records.map((r) => r._source_row),
    [2, 4],
  );
  assert.equal(parsed.segments[1].row, 4);
});
test("AI suggestions require exact evidence and reject fabricated values and invalid sources", () => {
  const segments = [
    {
      id: "p1-l1",
      page: 1,
      line: 1,
      text: "Full Name: Jane Doe",
      confidence: null,
    },
  ];
  const checked = validateAIFields(
    [
      {
        name: "FULL_NAME",
        value: "Jane Doe",
        segmentId: "p1-l1",
        quote: "Full Name: Jane Doe",
        confidence: 0.8,
      },
      {
        name: "COMPANY_NAME",
        value: "Invented Ltd",
        segmentId: "p1-l1",
        quote: "Full Name: Jane Doe",
      },
      { name: "DATE", value: "2026", segmentId: "missing", quote: "2026" },
      {
        name: "CONSTRUCTOR",
        value: "Jane Doe",
        segmentId: "p1-l1",
        quote: "Jane Doe",
      },
    ],
    segments,
  );
  assert.equal(checked.fields.length, 1);
  assert.equal(checked.rejected.length, 3);
  assert.equal(checked.fields[0].confidence, 0.8);
});
test("AI provider integration validates response content and reports errors without fabricated fallback", async () => {
  const doc = {
    segments: [{ id: "text-l1", text: "Full Name: Jane Doe", line: 1 }],
  };
  let body;
  const result = await extractWithAI(doc, {
    key: "synthetic-test-key",
    fetcher: async (url, options) => {
      body = JSON.parse(options.body);
      assert.ok(options.signal);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: [
                    {
                      name: "FULL_NAME",
                      value: "Jane Doe",
                      segmentId: "text-l1",
                      quote: "Full Name: Jane Doe",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.fields[0].value, "Jane Doe");
  assert.equal(body.response_format.type, "json_object");
  await assert.rejects(extractWithAI(doc, { key: "" }), { status: 503 });
  await assert.rejects(
    extractWithAI(doc, {
      key: "synthetic",
      fetcher: async () => new Response("bad", { status: 503 }),
    }),
    { status: 502 },
  );
});
test("review distinguishes user corrections/manual additions and refuses duplicate fields", () => {
  const extraction = {
    fields: extractLabelledFields({
      text: "Full name: John Sm1th\nDonation: R500",
    }),
  };
  const review = extraction.fields.map((f) => ({
    id: f.id,
    name: f.name,
    value: f.name === "FULL_NAME" ? "John Smith" : f.value,
  }));
  review.push({ name: "REFERENCE_NUMBER", value: "Manual ref" });
  const { record, provenance } = reviewedRecord(review, extraction, "doc");
  assert.equal(record.FULL_NAME, "John Smith");
  assert.equal(provenance[0].originalValue, "John Sm1th");
  assert.equal(provenance[0].corrected, true);
  assert.equal(provenance[2].method, "manual");
  assert.equal(provenance[2].source, null);
  assert.throws(
    () => reviewedRecord([...review, review[0]], extraction, "doc"),
    /duplicate/,
  );
  assert.throws(
    () =>
      reviewedRecord(
        [{ id: "invented", name: "TEST", value: "test" }],
        extraction,
        "doc",
      ),
    /Unknown/,
  );
});
test("processing queue bounds concurrency and keeps working after a task fails", async () => {
  const queue = createProcessingQueue(2);
  let active = 0,
    peak = 0;
  const work = () => {
    active++;
    peak = Math.max(peak, active);
    return new Promise((resolve) =>
      setTimeout(() => {
        active--;
        resolve();
      }, 5),
    );
  };
  const result = await Promise.allSettled([
    queue(work),
    queue(() => {
      throw Error("expected");
    }),
    queue(work),
    queue(work),
  ]);
  assert.equal(result[1].status, "rejected");
  assert.equal(peak, 2);
  assert.equal(result[3].status, "fulfilled");
});
