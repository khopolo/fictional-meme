<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c7319af3bbe4e2c7ec8f2a964851a17113db607af1e1d73f8a23b308be5b8dce -->

# DocuFlow AI development report

Status: working local application; the complete requested production platform is not finished. No phase should be treated as production certified.

## Phase 1 — foundation (partial, continued 2026-11-06)
The backend now selects SQLite/private local files for local development or Supabase PostgreSQL/private Storage for hosted mode. server/repository.js maps records to the existing owned tables; complete editor configurations are retained in payload columns. Apply schema.sql followed by 002_runtime.sql once to a new Supabase project. User-JWT reads enforce RLS; server-only service credentials perform allowlisted mutations after owner/type checks. Files use owner-prefixed private buckets, including signatures. A secure-link endpoint issues 60-second download URLs; authenticated downloads also work.

Hosted startup checks the payload migration and private bucket configuration. It requires SUPABASE_URL, SUPABASE_ANON_KEY and server-only SUPABASE_SERVICE_ROLE_KEY. It never silently falls back to local persistence when hosted configuration is incomplete. Local workspace data is not automatically copied into Supabase.

The interface now handles password recovery links with password confirmation and updateUser, email verification redirects, and editable display names in Settings. User changes clear cached state and stale responses cannot repopulate another session. These live Auth/profile flows still need testing against a configured Supabase project.

A real PostgreSQL 17 test applies both migrations with minimal auth/storage schema contracts, then checks owner isolation, profile creation/update isolation, forbidden client mutations and forged audits, storage ownership policies, cross-owner foreign keys, and history retention after asset deletion. This is SQL policy verification, not a full Supabase Auth/Storage API test. The SDK HTTP contract test verifies owner/JWT filters, typed payload writes, owner-prefixed uploads and signed-link expiry using a synthetic HTTP fixture.

Remaining: hosted Supabase end-to-end acceptance, account deletion, organisations/teams, full child-table materialisation for extracted records/template fields, storage/database deletion reconciliation and durable workers. Local mode is a shared development workspace.

## Phase 2 — document understanding (continued 2026-11-06)

Actual text/DOCX/spreadsheet parsing and image OCR now include segment provenance. PDFs preserve page/line references. Text-free pages in mixed or fully scanned PDFs are rasterised over the original page and read through local Tesseract OCR. Spreadsheet row references now use physical sheet row numbers, including gaps. Word/TXT locations are extracted-text lines, not fabricated page numbers. Original files remain preserved.

The Document Reader has source/field tabs, page/sheet/row references, exact source quotes, editable values/names, field removal/addition, field search and explicit review approval. Labelled extraction copies supported explicit labels and email patterns; it does not infer missing information. An optional server-side AI extraction request uses the configured OpenAI-compatible provider and accepts only values supported by exact quotes in a known source segment. Unsupported suggestions are rejected and counted. Model confidence is uncalibrated; OCR confidence is recognition quality, not factual accuracy. All fields require review.

Approved fields form a reusable single-record dataset with original values, quotes, locations, correction flags and manual-entry labels. Repeated approval updates the same reviewed dataset. Stale extraction versions, missing approval and duplicate field names are rejected. Corrections remain distinguished from source evidence. Reviewed datasets can be used in the existing template/generation workflow. Spreadsheet records are available directly in Data Library rather than collapsed into one document record.

Two document tasks and one OCR task run concurrently at most. Default limits are 100 PDF pages, 20 OCR pages and 50,000 spreadsheet records. PDF/OCR page bounds are configurable in .env.example; over-limit files fail explicitly rather than being silently truncated. The OCR model cache requires a writable directory and downloads the English model on first use if absent.

Remaining: live AI inference against a configured provider, general PDF/Word table extraction, multi-record entity grouping from unstructured files, richer field schemas, legacy DOC conversion, OCR language options, image dimension/resource isolation, durable processing/recovery and production load tests. Local OCR accuracy depends on scan quality.

## Phase 3 — datasets, mapping and templates (partial)
Editable spreadsheet rows with add/delete/search, CSV and XLSX exports, reviewed source evidence and source-document links, deterministic mapping suggestions, concatenated fields, PDF backgrounds, percentage-based coordinates, page number and font size fields, and sample PDF preview work. Remaining: direct drag placement over rendered original PDFs, date/currency transforms, conditional rules, multiple source joins, image/logo editing, full font/alignment/color controls, DOCX/XLSX/image template processing.

## Phase 4 — signatures (partial)
Drawing, PNG/JPEG image import to canvas, private image file storage, save/name/delete, explicit batch authorisation, persisted signing-authorisation rows and audit entries are implemented. Signature images are embedded in PDFs. Remaining: crop/replace/default signature UI, user-configurable opacity/rotation/size, printed name/date, immutable audit storage and full positioning acceptance tests. Images are not cryptographic signatures.

## Phase 5 — generation (partial)
A 100-record real batch generates individual PDFs with original PDF backgrounds and signatures. Jobs expose progress and record errors; original and generated files and ZIP downloads work. Saved PDFs are reopened before success. Interrupted jobs are marked on restart. Remaining: durable distributed queue, bounded worker concurrency, idempotency, selective record generation, per-record retries, filename rules, combined PDF and DOCX exports, reports and production scale testing. Local ceiling is 1,000 records per batch.

## Phase 6 — business and tender tools (partial)
Business profile information persists. Tender extraction deterministically copies requirement sentences and supports manual readiness statuses. Remaining: verified-source company imports, business document generation presets, automated evidence matching, expiration checks, source-cited AI tender analysis and report exports. The current checklist never assumes compliance.

## Phase 7 — assistant, comparison and search (partial)
Source-text comparisons retain added/removed/unchanged text. Document name/content search works. The configured assistant can answer and propose plans, with no automatic mutations. Remaining: natural-language retrieval, tool execution with approvals, persisted chat and source selection, multi-document semantic comparison and project linkage/history.

## Phase 8 — subscriptions (not implemented)
Plan/subscription tables are drafted. There are no prices, checkout, billing history, payment webhooks, paid entitlements or subscription restrictions. PayFast integration and verified server-side payment handling remain outstanding.

## Phase 9 — validation and hardening (partial)
Seventeen automated tests passed on the current document-processing implementation. The HTTP suite exercised real Excel/PDF/Word uploads, 100 extracted rows, duplicate detection, field mapping, signature-authorisation rejection, a signed preview, 100 generated PDFs, ZIP and original downloads, tender requirements, forbidden file types, path-injection stripping, and deletion. A separate 100-PDF test verified unique recipient text and embedded image resources. Mapping, comparison and tender source fidelity tests passed. A download failure found during the first integration run was repaired and the suite rerun successfully.

Image OCR read JOHN SMITH and DONATION: 500 from a controlled generated image. A prior dense dashboard screenshot did not yield the expected text; OCR quality is not guaranteed. Desktop browser project create/delete passed. Browser viewport checks were performed at 1440×1050 and 390×844. Production build passed, with a roughly 500 KB client bundle warning. npm audit --omit=dev reports zero known vulnerabilities after updating SheetJS and glob/minimatch dependencies.

Not executed: live Supabase account registration/email verification and storage API round trips, deployed-project isolation checks, live AI inference, subscription restriction tests, PayFast payments, legal/security review, exact signature position inspection, failed-generation retries, or production load/security tests. CodeRabbit Emulate v0.0.1 catalog was inspected; it provides no Supabase or OpenAI emulator.

## Deployment requirements
Supabase URL and public anon key; server-only Supabase service key and both migrations; hosted validation of the implemented PostgreSQL/private storage adapter; server-only AI provider key and approved data-processing terms; durable queue and worker infrastructure; email delivery configuration; payment account and verified webhooks; malware scanning; rate limits/CSRF and upload resource controls; backup/retention policy; reviewed South African privacy and commercial terms. Existing UI privacy text is a development notice, not a completed legal policy.

## Run locally
Node 24, npm install, npm run dev. Open port 3000. npm test starts an isolated temporary server/database and removes its fixture data. npm run build creates dist. Configure .env from .env.example and launch with node --env-file=.env server/index.js when integrations are available. Never place provider secrets in VITE-prefixed variables.

## Continuation verification and behavior changes — 2026-11-06

- npm test: eight tests passed, including the 100-recipient HTTP workflow and separate content/image-resource verification for 100 PDFs. Added dataset edit, wrong-type rejection, private signature round trip/rename, metadata hiding, immutable audit deletion and active-batch asset protection assertions.
- DOCKER_HOST=<task Unix socket> npm run test:rls: passed against disposable PostgreSQL 17 containers. The first attempt connected during PostgreSQL initialization and failed; waiting for the final server process corrected the readiness check. Both migrations then applied and all assertions passed.
- npm run build passed (approximately 503 KB client bundle warning). npm audit --omit=dev reported zero known vulnerabilities. Production/hosted startup correctly rejected missing authentication or persistence credentials.
- Shared cloud Chromium: Settings accurately showed local persistence; a signature was drawn through actual mouse events, saved, displayed, and deleted through the UI. The temporary signature and its image were removed.
- Audit/signing/job history can no longer be erased through the generic deletion endpoint. Source documents referenced by a template or tender analysis return a clear conflict until references are removed. Assets used by a running batch are protected until completion. These checks tighten the original generic deletion implementation to preserve auditability and prevent invalid background work. After completion, deleting a template/dataset/signature preserves historical jobs and authorisations; typed SQL references become null while their historical payloads remain.

At the time of the sandbox checks, the application reported local persistence and no AI provider. The user reports their Supabase project is active; this turn proceeded to document processing without changing that external project. The emulator catalog inspected here does not include Supabase or OpenAI. Live recovery-email/session behavior, private bucket HTTP round trips, AI inference, billing and production deployment remain unverified.

## Document intelligence verification — 2026-11-06

- npm test: 17 tests passed. New cases execute real mixed-PDF and image OCR; verify page evidence, OCR limits and physical spreadsheet row numbers; reject invented AI values and unknown evidence; validate provider error handling through synthetic HTTP responses; preserve user corrections/manual values; and verify bounded processing concurrency.
- The new HTTP flow uploads a mixed PDF and an invalid PDF, recognises the scanned donor fields, rejects unconfigured AI without overwriting prior results, enforces explicit review and extraction version checks, saves corrected values and original evidence, exports CSV, reuses the dataset in a real generated PDF preview, and retries failed PDF processing with an actual failed result. CSV exports neutralise leading formula strings while numeric values retain their type. Reviewed dataset source IDs cannot be reassigned by edits.
- The original 100-document generation, signature, ZIP, isolation and source-comparison tests also passed in this turn. The previous PostgreSQL migration/RLS results are reused; this turn changed neither the migrations nor the repository adapter.
- Production build passed with a 511.71 KB uncompressed client bundle warning. npm audit --omit=dev reported zero vulnerabilities. A direct dev dependency on the already-installed native canvas version supports synthetic OCR fixture generation.
- Shared Chromium verification: uploaded a mixed PDF, extracted four labelled fields (company, donor, amount and email), corrected a donor name, approved and saved the dataset, downloaded an actual CSV containing the corrected value, edited/saved the dataset again, followed its source link, and deleted the temporary document and derived dataset. OCR confidence on the clear synthetic scan was displayed as 94%; this is not a guarantee for other files. At 390×844, the extraction table scrolled horizontally while the page stayed within the viewport. The temporary fixture was removed; audit history remains.
- Live AI-provider responses were not executed: the active sandbox reports ai:false. AI parsing/evidence/error paths are fixture-tested. This is not a claim of hosted AI acceptance, Supabase project validation or production readiness. All remaining phases and deployment requirements above still apply.


<!-- /coderabbit-ai-generated:v1 -->