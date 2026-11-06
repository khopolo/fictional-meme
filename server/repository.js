import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const notFound = () =>
  Object.assign(new Error("Item not found"), { status: 404 });
export const tables = {
  documents: "uploaded_documents",
  projects: "projects",
  datasets: "extracted_datasets",
  templates: "document_templates",
  signatures: "signatures",
  jobs: "generation_jobs",
  generated: "generated_documents",
  business: "business_profiles",
  tenders: "tender_projects",
  plans: "subscription_plans",
  subscriptions: "user_subscriptions",
  user_subscriptions: "user_subscriptions",
  comparisons: "document_comparisons",
  audit: "audit_logs",
  authorisations: "signing_authorisations",
};
function row(data) {
  const now = new Date().toISOString();
  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || data.createdAt || now,
  };
}
export async function getActiveSubscription(repo) {
  const subs = await repo.list("user_subscriptions");
  const plans = repo.listPlans
    ? await repo.listPlans()
    : await repo.list("subscription_plans");
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  let active = null;
  for (const sub of subs) {
    const owner = sub.ownerId ?? sub.owner_id ?? repo.owner;
    if (owner !== repo.owner) continue;
    const status = String(sub.status || "").toLowerCase();
    const expiresAt = sub.expiresAt ?? sub.expires_at ?? null;
    if (!["active", "trial"].includes(status)) continue;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) continue;
    const candidate = {
      ...sub,
      plan: planById.get(sub.planId ?? sub.plan_id ?? sub.planID) || null,
    };
    if (!active) {
      active = candidate;
      continue;
    }
    const aTs = new Date(active.updatedAt || active.createdAt || 0).getTime();
    const cTs = new Date(sub.updatedAt || sub.createdAt || 0).getTime();
    if (cTs > aTs) active = candidate;
  }
  return active;
}
export async function hasEntitlement(repo, entitlement) {
  if (!entitlement) return false;
  const subscription = await getActiveSubscription(repo);
  if (!subscription) return false;
  const plan = subscription.plan;
  if (!plan || plan.active === false) return false;
  const entitlements = plan.entitlements || {};
  return Boolean(entitlements[entitlement]);
}
export async function recoverProcessingJobs(repo, { staleAfterMs = 5 * 60 * 1000 } = {}) {
  const jobs = await repo.list("jobs");
  for (const job of jobs) {
    if (job.status !== "Processing") continue;
    const touchedAt = new Date(job.updatedAt || job.createdAt || 0).getTime();
    if (Number.isNaN(touchedAt) || Date.now() - touchedAt < staleAfterMs) continue;
    const next = {
      ...job,
      status: "Interrupted",
      errors: [
        ...(Array.isArray(job.errors) ? job.errors : []),
        {
          record: 0,
          error:
            "Processing stalled or the server restarted. Review completed files before starting another batch.",
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await repo.save("jobs", next);
  }
}

export function createLocalDatabase(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(root, "workspace.db"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS entities_owner ON entities(owner,kind)",
  );
  for (const r of db
    .prepare("SELECT owner,data FROM entities WHERE kind='jobs'")
    .all()) {
    const job = JSON.parse(r.data);
    if (job.status === "Processing") {
      job.status = "Interrupted";
      job.updatedAt = new Date().toISOString();
      job.errors = [
        ...(Array.isArray(job.errors) ? job.errors : []),
        {
          record: 0,
          error:
            "Processing stalled or the server restarted. Review completed files before starting another batch.",
        },
      ];
      db.prepare("UPDATE entities SET data=? WHERE owner=? AND id=?").run(
        JSON.stringify(job),
        r.owner,
        job.id,
      );
    }
  }
  return db;
}
export class LocalRepository {
  constructor(db, root, owner) {
    this.db = db;
    this.root = root;
    this.owner = owner;
  }
  async list(kind) {
    return this.db
      .prepare(
        "SELECT data FROM entities WHERE owner=? AND kind=? ORDER BY rowid",
      )
      .all(this.owner, kind)
      .map((r) => JSON.parse(r.data));
  }
  async get(id, kind) {
    const r = this.db
      .prepare("SELECT kind,data FROM entities WHERE owner=? AND id=?")
      .get(this.owner, id);
    if (!r || (kind && r.kind !== kind)) throw notFound();
    return { ...JSON.parse(r.data), _kind: r.kind };
  }
  async save(kind, data) {
    const clean = { ...data };
    delete clean._kind;
    const value = row(clean);
    const existing = this.db
      .prepare("SELECT owner,kind FROM entities WHERE id=?")
      .get(value.id);
    if (existing && (existing.owner !== this.owner || existing.kind !== kind))
      throw notFound();
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE entities.owner=excluded.owner AND entities.kind=excluded.kind",
      )
      .run(value.id, this.owner, kind, JSON.stringify(value));
    return value;
  }
  async remove(id) {
    this.db
      .prepare("DELETE FROM entities WHERE owner=? AND id=?")
      .run(this.owner, id);
  }
  async putFile(bytes, bucket = "documents") {
    const key = path.join(this.root, crypto.randomUUID());
    await fsp.writeFile(key, bytes, { mode: 0o600 });
    return { filePath: key };
  }
  async readFile(item) {
    if (!item.filePath) throw notFound();
    const target = path.resolve(item.filePath);
    if (path.dirname(target) !== path.resolve(this.root)) throw notFound();
    return fsp.readFile(target);
  }
  async deleteFile(item) {
    if (item.filePath) {
      if (path.dirname(path.resolve(item.filePath)) !== path.resolve(this.root))
        throw notFound();
      await fsp.rm(item.filePath, { force: true });
    }
  }
  async signedUrl() {
    return null;
  }
}
export function remoteColumns(kind, d) {
  const common = {
    id: d.id,
    owner_id: d.owner_id,
    payload: { ...d },
    created_at: d.createdAt,
  };
  delete common.payload.owner_id;
  switch (kind) {
    case "documents":
      return {
        ...common,
        name: d.name,
        storage_path: d.storagePath,
        content_hash: d.hash,
        size_bytes: d.size,
        status: d.status,
      };
    case "projects":
      return { ...common, name: d.name, description: d.description || null };
    case "datasets":
      return { ...common, name: d.name, document_id: d.documentId || null };
    case "templates":
      return { ...common, name: d.name, document_id: d.documentId || null };
    case "signatures":
      return { ...common, name: d.name, storage_path: d.storagePath };
    case "jobs":
      return {
        ...common,
        template_id: d.templateId,
        dataset_id: d.datasetId,
        status: d.status,
        progress: { completed: d.completed, failed: d.failed, total: d.total },
      };
    case "plans":
    case "subscription_plans":
      return {
        ...common,
        name: d.name,
        entitlements: d.entitlements || {},
        provider_price_id: d.providerPriceId || d.provider_price_id || null,
        active: d.active !== false,
      };
    case "subscriptions":
    case "user_subscriptions":
      return {
        ...common,
        owner_id: d.ownerId || d.owner_id || d.owner || null,
        plan_id: d.planId || d.plan_id || null,
        provider_reference: d.providerReference || d.provider_reference || null,
        status: d.status,
        expires_at: d.expiresAt || d.expires_at || null,
      };
    case "generated":
      return {
        ...common,
        job_id: d.jobId,
        name: d.name,
        storage_path: d.storagePath,
        verified_at: d.createdAt,
      };
    case "business":
      return { ...common, verified_information: d };
    case "tenders":
      return { ...common, document_id: d.documentId };
    case "comparisons":
      return { ...common, source_ids: d.sourceIds, changes: d.changes };
    case "audit":
      return { ...common, action: d.action, details: d.details };
    case "authorisations":
      return {
        ...common,
        signature_id: d.signatureId,
        job_id: d.jobId,
        scope: d.scope,
      };
    default:
      throw new Error("Unknown entity kind");
  }
}
export class SupabaseRepository {
  // Reads use the user's JWT and RLS. Mutations use a server-only client after
  // ownership/type checks; protected audit/billing tables have no client writes.
  constructor(client, admin, owner) {
    this.client = client;
    this.admin = admin;
    this.owner = owner;
  }
  async list(kind) {
    const out = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await this.client
        .from(tables[kind])
        .select("id,payload")
        .eq("owner_id", this.owner)
        .order("created_at")
        .order("id")
        .range(start, start + 499);
      if (error) throw new Error("Database read failed: " + error.message);
      out.push(...data.map((r) => ({ ...r.payload, id: r.id })));
      if (data.length < 500) break;
    }
    return out;
  }
  async listPlans() {
    const { data, error } = await this.admin
      .from("subscription_plans")
      .select("id,name,entitlements,active")
      .eq("active", true);
    if (error) throw new Error("Database plan read failed: " + error.message);
    return data;
  }
  async get(id, kind) {
    for (const k of kind ? [kind] : Object.keys(tables)) {
      const { data, error } = await this.client
        .from(tables[k])
        .select("id,payload")
        .eq("owner_id", this.owner)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("Database read failed: " + error.message);
      if (data) return { ...data.payload, id: data.id, _kind: k };
    }
    throw notFound();
  }
  async save(kind, data) {
    const clean = { ...data };
    delete clean._kind;
    const d = row(clean);
    const table = tables[kind];
    if (!table) throw new Error("Unknown entity kind");
    const { data: existing, error: lookupError } = await this.admin
      .from(table)
      .select("owner_id")
      .eq("id", d.id)
      .maybeSingle();
    if (lookupError) throw new Error("Database lookup failed");
    if (existing && existing.owner_id !== this.owner) throw notFound();
    const { error } = await this.admin
      .from(table)
      .upsert(remoteColumns(kind, { ...d, owner_id: this.owner }), {
        onConflict: "id",
      });
    if (error) throw new Error("Database write failed: " + error.message);
    return d;
  }
  async remove(id, kind) {
    await this.get(id, kind);
    const { error } = await this.admin
      .from(tables[kind])
      .delete()
      .eq("owner_id", this.owner)
      .eq("id", id);
    if (error) throw new Error("Database deletion failed: " + error.message);
  }
  async putFile(bytes, bucket = "documents") {
    const storagePath = this.owner + "/" + crypto.randomUUID();
    const { error } = await this.client.storage
      .from(bucket)
      .upload(storagePath, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (error) throw new Error("Private upload failed: " + error.message);
    return { storagePath, bucket };
  }
  validateFile(item) {
    if (
      !["documents", "signatures"].includes(item.bucket) ||
      !item.storagePath?.startsWith(this.owner + "/")
    )
      throw notFound();
  }
  async readFile(item) {
    this.validateFile(item);
    const { data, error } = await this.client.storage
      .from(item.bucket)
      .download(item.storagePath);
    if (error) throw new Error("Private download failed: " + error.message);
    return Buffer.from(await data.arrayBuffer());
  }
  async deleteFile(item) {
    if (!item.storagePath) return;
    this.validateFile(item);
    const { error } = await this.client.storage
      .from(item.bucket)
      .remove([item.storagePath]);
    if (error) throw new Error("Private deletion failed: " + error.message);
  }
  async signedUrl(item) {
    this.validateFile(item);
    const { data, error } = await this.client.storage
      .from(item.bucket)
      .createSignedUrl(item.storagePath, 60, { download: item.name });
    if (error) throw new Error("Secure download link failed");
    return { url: data.signedUrl, expiresIn: 60 };
  }
}
