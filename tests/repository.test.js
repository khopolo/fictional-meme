import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createLocalDatabase,
  LocalRepository,
  SupabaseRepository,
  remoteColumns,
} from "../server/repository.js";
test("local repository isolates records, mutations, types and files for two owners", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "docuflow-owner-"));
  const db = createLocalDatabase(root);
  try {
    const alice = new LocalRepository(db, root, "alice"),
      bob = new LocalRepository(db, root, "bob");
    const file = await alice.putFile(Buffer.from("Alice private content"));
    const own = await alice.save("documents", { name: "private.txt", ...file });
    await bob.save("projects", { name: "Bob only" });
    assert.equal((await alice.list("projects")).length, 0);
    assert.equal((await bob.list("documents")).length, 0);
    await assert.rejects(bob.get(own.id), { status: 404 });
    await assert.rejects(
      bob.save("documents", { id: own.id, name: "overwrite" }),
      { status: 404 },
    );
    await assert.rejects(alice.get(own.id, "templates"), { status: 404 });
    await bob.remove(own.id);
    assert.equal(
      (await alice.readFile(await alice.get(own.id))).toString(),
      "Alice private content",
    );
    await assert.rejects(alice.readFile({ filePath: "/etc/passwd" }), {
      status: 404,
    });
    await alice.deleteFile(own);
    await alice.remove(own.id);
    await assert.rejects(alice.get(own.id), { status: 404 });
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("remote column mapping preserves ownership, source FKs and avoids mutating inputs", () => {
  const input = {
    id: "id",
    owner_id: "alice",
    name: "Donors",
    documentId: "doc",
    records: [{ Name: "Alice" }],
    createdAt: "2026-11-06T00:00:00Z",
  };
  const row = remoteColumns("datasets", input);
  assert.equal(row.owner_id, "alice");
  assert.equal(row.document_id, "doc");
  assert.equal(row.payload.records[0].Name, "Alice");
  assert.equal(input.owner_id, "alice");
  assert.equal(row.payload.owner_id, undefined);
});
test("Supabase SDK requests carry owner filters, JWTs, private paths and 60-second links", async () => {
  // HTTP contract fixture only; real SQL policy tests run separately against PostgreSQL.
  const owner = "11111111-1111-4111-8111-111111111111",
    calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ u, options });
    let result;
    if (u.pathname.includes("/object/sign/"))
      result = {
        signedURL: "/object/sign/documents/owner/file?token=synthetic",
      };
    else if (u.pathname.includes("/storage/"))
      result = { Key: owner + "/file" };
    else if (options.method === "POST") result = {};
    else result = [];
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient("https://fixture.invalid", "test-public-key", {
    global: {
      fetch: fetcher,
      headers: { Authorization: "Bearer synthetic-user-jwt" },
    },
    auth: { persistSession: false },
  });
  const admin = createClient("https://fixture.invalid", "test-server-key", {
    global: { fetch: fetcher },
    auth: { persistSession: false },
  });
  const repo = new SupabaseRepository(client, admin, owner);
  assert.deepEqual(await repo.list("documents"), []);
  assert.equal(calls[0].u.searchParams.get("owner_id"), "eq." + owner);
  assert.equal(
    new Headers(calls[0].options.headers).get("authorization"),
    "Bearer synthetic-user-jwt",
  );
  await assert.rejects(repo.get("id", "projects"), { status: 404 });
  const project = await repo.save("projects", { name: "Owned project" });
  const mutation = calls.find(
    (c) => c.options.method === "POST" && c.u.pathname.includes("projects"),
  );
  const body = JSON.parse(mutation.options.body);
  assert.equal(body.owner_id, owner);
  assert.equal(body.payload.id, project.id);
  const file = await repo.putFile(Buffer.from("private"), "documents");
  assert.ok(file.storagePath.startsWith(owner + "/"));
  await assert.rejects(
    repo.readFile({ ...file, storagePath: "other-owner/file" }),
    { status: 404 },
  );
  const link = await repo.signedUrl({ ...file, name: "private.pdf" });
  assert.equal(link.expiresIn, 60);
  const signing = calls.find((c) => c.u.pathname.includes("/object/sign/"));
  assert.equal(JSON.parse(signing.options.body).expiresIn, 60);
});
