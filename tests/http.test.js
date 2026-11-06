import { test } from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph } from "docx";
const base = process.env.TEST_API_URL || "http://localhost:3000/api";
async function req(p, body, method = "POST") {
  const r = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function state() {
  return (await fetch(base + "/state")).json();
}
test("HTTP workflow: real uploads, parsing, duplicate detection, generation, ZIP and deletion", async () => {
  const initial = await state();
  const before = new Set(
    Object.values(initial)
      .flat()
      .map((x) => x.id),
  );
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(
        Array.from({ length: 100 }, (_, i) => ({
          "First Name": "Recipient " + i,
          Surname: "Test",
          Donation: 500,
        })),
      ),
      "Donors",
    );
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Certificate of Appreciation", {
      x: 200,
      y: 450,
      font,
      size: 26,
    });
    const files = [
      [
        "donors-test.xlsx",
        XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      ],
      ["certificate-test.pdf", await pdf.save()],
      [
        "tender-test.docx",
        await Packer.toBuffer(
          new Document({
            sections: [
              {
                children: [
                  new Paragraph(
                    "Tax certificate is mandatory. Submit before Friday.",
                  ),
                ],
              },
            ],
          }),
        ),
      ],
    ];
    const form = new FormData();
    for (const [n, b] of files) form.append("files", new Blob([b]), n);
    const uploaded = await (
      await fetch(base + "/upload", { method: "POST", body: form })
    ).json();
    assert.equal(uploaded.length, 3);
    let current;
    for (let i = 0; i < 100; i++) {
      current = await state();
      if (
        uploaded.every(
          (u) =>
            current.documents.find((d) => d.id === u.id)?.status === "Ready",
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(
      uploaded.every(
        (u) => current.documents.find((d) => d.id === u.id)?.status === "Ready",
      ),
    );
    const ds = current.datasets.find((d) => d.documentId === uploaded[0].id);
    assert.equal(ds.records.length, 100);
    const config = await (await fetch(base + "/config")).json();
    assert.equal(config.persistence, "local");
    assert.equal(config.supabaseServiceRoleKey, undefined);
    const edited = await req("/items/datasets", { ...ds, records: ds.records });
    assert.equal(edited.status, 200);
    assert.equal(
      (await req("/items/templates", { id: ds.id, name: "wrong type" })).status,
      404,
    );
    assert.equal(
      (await fetch(base + "/files/" + uploaded[1].id + "/link")).status,
      409,
    );

    const duplicate = new FormData();
    duplicate.append("files", new Blob([files[0][1]]), files[0][0]);
    assert.equal(
      (
        await (
          await fetch(base + "/upload", { method: "POST", body: duplicate })
        ).json()
      )[0].duplicate,
      true,
    );
    const template = (
      await req("/items/templates", {
        name: "Acceptance Certificate",
        documentId: uploaded[1].id,
        fields: [
          { name: "FULL_NAME", x: 30, y: 50, size: 24 },
          { name: "SIGNATURE", x: 65, y: 80 },
        ],
      })
    ).data;
    const mappings = (
      await req("/mappings", { datasetId: ds.id, templateId: template.id })
    ).data;
    assert.equal(mappings.FULL_NAME, "First Name + Surname");
    const signature = (
      await req("/items/signatures", {
        name: "Test authorisation",
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=",
      })
    ).data;
    const payload = {
      templateId: template.id,
      datasetId: ds.id,
      mappings,
      signatureId: signature.id,
      approved: true,
    };
    assert.equal((await req("/generate", payload)).status, 400);
    const preview = await fetch(base + "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, authorised: true }),
    });
    assert.equal(preview.status, 200);
    assert.equal(
      (await PDFDocument.load(await preview.arrayBuffer())).getPageCount(),
      1,
    );
    const job = (await req("/generate", { ...payload, authorised: true })).data;
    assert.equal(
      (await req("/items/" + template.id, null, "DELETE")).status,
      409,
    );
    for (let i = 0; i < 100; i++) {
      current = await state();
      if (current.jobs.find((j) => j.id === job.id)?.status === "Completed")
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(current.jobs.find((j) => j.id === job.id).completed, 100);
    assert.equal(
      current.generated.filter((g) => g.jobId === job.id).length,
      100,
    );
    const zip = await fetch(base + "/jobs/" + job.id + "/zip");
    assert.equal(zip.status, 200);
    assert.equal(
      Buffer.from(await zip.arrayBuffer())
        .subarray(0, 2)
        .toString(),
      "PK",
    );
    const original = await fetch(base + "/files/" + uploaded[1].id);
    assert.equal(original.status, 200);
    const tender = (await req("/tender", { documentId: uploaded[2].id })).data;
    assert.ok(tender.requirements.length > 0);
    assert.equal(
      (await req("/items/" + uploaded[1].id, null, "DELETE")).status,
      409,
    );
    const auditEntry = (await state()).audit.find(
      (a) => a.action === "Signature authorised",
    );
    assert.ok(auditEntry);
    assert.equal(
      (await req("/items/" + auditEntry.id, null, "DELETE")).status,
      403,
    );
    assert.equal(
      (
        await req("/items/signatures", {
          id: signature.id,
          name: "Renamed signature",
        })
      ).status,
      200,
    );
    const savedSignature = (await state()).signatures.find(
      (s) => s.id === signature.id,
    );
    assert.ok(savedSignature.image.startsWith("data:image/png;base64,"));
    assert.equal(savedSignature.filePath, undefined);
    assert.equal(savedSignature.storagePath, undefined);

    const forged = (
      await req("/items/projects", {
        name: "Path injection test",
        filePath: "/etc/passwd",
      })
    ).data;
    assert.equal((await fetch(base + "/files/" + forged.id)).status, 404);
    const unsupported = new FormData();
    unsupported.append("files", new Blob(["no"]), "script.exe");
    assert.equal(
      (await fetch(base + "/upload", { method: "POST", body: unsupported }))
        .status,
      400,
    );
    await req("/items/" + uploaded[0].id, null, "DELETE");
    assert.equal((await fetch(base + "/files/" + uploaded[0].id)).status, 404);
    assert.ok(!(await state()).datasets.some((d) => d.id === ds.id));
  } finally {
    const current = await state();
    for (const x of Object.values(current).flat())
      if (!before.has(x.id)) await req("/items/" + x.id, null, "DELETE");
  }
});

test("document intelligence HTTP flow: OCR, exact evidence, review approval, correction, CSV and retry", async () => {
  const { mixedPDF } = await import("./fixtures.js");
  const { PDFParse } = await import("pdf-parse");
  const before = new Set((await state()).documents.map((d) => d.id));
  let template;
  try {
    const form = new FormData();
    form.append(
      "files",
      new Blob([await mixedPDF()]),
      "mixed-donor-acceptance.pdf",
    );
    form.append(
      "files",
      new Blob(["not a valid pdf"]),
      "broken-acceptance.pdf",
    );
    const uploaded = await (
      await fetch(base + "/upload", { method: "POST", body: form })
    ).json();
    let current;
    for (let i = 0; i < 200; i++) {
      current = await state();
      if (
        uploaded.every((u) =>
          ["Ready", "Failed"].includes(
            current.documents.find((d) => d.id === u.id)?.status,
          ),
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const doc = current.documents.find((d) => d.id === uploaded[0].id),
      broken = current.documents.find((d) => d.id === uploaded[1].id);
    assert.equal(doc.status, "Ready");
    assert.equal(doc.processing.ocrPages, 1);
    assert.equal(broken.status, "Failed");
    const extraction = (
      await req("/documents/" + doc.id + "/extract", { mode: "labelled" })
    ).data;
    assert.equal(
      extraction.fields.find((f) => f.name === "FULL_NAME").value,
      "JOHN SMITH",
    );
    assert.equal(
      extraction.fields.find((f) => f.name === "DONATION_AMOUNT").source.page,
      2,
    );
    assert.equal(
      (await req("/documents/" + doc.id + "/extract", { mode: "ai" })).status,
      503,
    );
    assert.equal(
      (await state()).documents.find((d) => d.id === doc.id).extraction.id,
      extraction.id,
    );
    const fields = extraction.fields.map((f) => ({
      id: f.id,
      name: f.name,
      value: f.name === "FULL_NAME" ? "JOHN A SMITH" : f.value,
    }));
    assert.equal(
      (
        await req("/documents/" + doc.id + "/review", {
          extractionId: extraction.id,
          fields,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("/documents/" + doc.id + "/review", {
          extractionId: "stale",
          approved: true,
          fields,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await req("/documents/" + doc.id + "/review", {
          extractionId: extraction.id,
          approved: true,
          fields: [...fields, fields[0]],
        })
      ).status,
      400,
    );
    const approved = await req("/documents/" + doc.id + "/review", {
      extractionId: extraction.id,
      approved: true,
      fields,
    });
    assert.equal(approved.status, 200);
    const ds = approved.data;
    assert.equal(ds.records[0].FULL_NAME, "JOHN A SMITH");
    assert.equal(
      ds.fieldProvenance.find((p) => p.name === "FULL_NAME").corrected,
      true,
    );
    const edited = await req("/items/datasets", {
      ...ds,
      records: [
        {
          ...ds.records[0],
          FULL_NAME: "JOHN A SMITH",
          _source_document: "wrong-doc",
        },
      ],
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.records[0]._source_document, doc.id);
    assert.equal(
      (await req("/items/datasets", { ...ds, documentId: "" })).status,
      400,
    );
    assert.equal(
      (await req("/items/datasets", { id: ds.id, documentId: "" })).status,
      400,
    );
    const again = (
      await req("/documents/" + doc.id + "/review", {
        extractionId: extraction.id,
        approved: true,
        fields,
      })
    ).data;
    assert.equal(again.id, ds.id);
    const formulaDataset = (
      await req("/items/datasets", {
        name: "CSV safety",
        records: [{ Name: "=1+1", Amount: -100 }],
      })
    ).data;
    const escaped = await (
      await fetch(
        base + "/datasets/" + formulaDataset.id + "/export?format=csv",
      )
    ).text();
    assert.ok(escaped.includes("'=1+1"));
    assert.ok(escaped.includes("-100"));
    await req("/items/" + formulaDataset.id, null, "DELETE");
    const csv = await fetch(base + "/datasets/" + ds.id + "/export?format=csv");
    assert.equal(csv.status, 200);
    assert.ok((await csv.text()).includes("JOHN A SMITH"));
    template = (
      await req("/items/templates", {
        name: "OCR review reuse",
        fields: [{ name: "FULL_NAME", x: 30, y: 50, size: 20 }],
      })
    ).data;
    const preview = await fetch(base + "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: template.id,
        datasetId: ds.id,
        mappings: { FULL_NAME: "FULL_NAME" },
      }),
    });
    assert.equal(preview.status, 200);
    const parser = new PDFParse({
      data: new Uint8Array(await preview.arrayBuffer()),
    });
    try {
      assert.match((await parser.getText()).text, /JOHN A SMITH/);
    } finally {
      await parser.destroy();
    }
    assert.equal(
      (await req("/documents/" + broken.id + "/retry", {})).status,
      200,
    );
    for (let i = 0; i < 100; i++) {
      const d = (await state()).documents.find((d) => d.id === broken.id);
      if (d.status === "Failed") {
        assert.ok(d.error);
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(
      (await state()).documents.find((d) => d.id === broken.id).status,
      "Failed",
    );
  } finally {
    if (template) await req("/items/" + template.id, null, "DELETE");
    for (const d of (await state()).documents)
      if (!before.has(d.id)) await req("/items/" + d.id, null, "DELETE");
  }
});
