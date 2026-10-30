# TrueMark automation: current-code audit and proposed rollout

Date: 2026-10-25. Status: audit complete; implementation and architecture approval pending.

This document describes the checkout inspected on this date. VERIFIED means source-confirmed,
not runtime-certified. PROPOSED sections are design decisions awaiting approval, not implemented
features. No production database or mail service was contacted.

## Constraints

- Preserve routes, UI, existing records, and separate manual operations.
- No table drops, production data deletion, commits, or pushes.
- Tests must use a fake email provider/local capture transport and must never use Gmail credentials.
- Deploy additive schema changes before enabling their consumers. Preserve legacy columns during rollout.
- Report actual test results and untested paths separately after every phase.

## Current execution and dependency map (VERIFIED)

```text
Next.js App Router
  proxy.ts -> lib/supabase/proxy.ts -> session refresh, CSP, admin route protection
  /login -> app/actions/auth.ts -> Supabase Auth
  /admin/templates -> app/actions/templates.ts -> templates table + templates bucket
  /admin/certificates/create -> app/actions/certificates.ts -> certificates + folders
  /admin/certificates/bulk -> browser CSV parser -> POST /api/certificates/bulk-create
      -> sequential record inserts + request-local SSE progress
  /admin/certificates -> CertificatesHeader + CertificatesSearch + CertificateCard
      -> manual PDF API / bulk PDF server action
          -> lib/pdf/generate-certificate.ts -> image/font fetches -> pdf-lib
          -> certificates bucket -> certificates.pdf_url
      -> manual email API / bulk-email API / email server actions
          -> lib/email/send-certificate.ts -> Nodemailer -> Gmail SMTP
          -> certificates.email_sent and email_sent_at
  bulk-email API -> lib/email/bulk-email-queue.ts -> process-local queue + SSE
  /verify/[code] -> anonymous-session certificate SELECT
  /api/verify/[code]/pdf -> valid-row SELECT -> fetch stored pdf_url -> cached bytes
```

Database operations exist in actions, API routes, dashboard queries, font helpers, and the
queue. All .from(), .select(), .insert(), .update(), storage upload, public URL, and signed
URL call sites in app/, lib/, and scripts/ were searched. There are no current RPC callers.
Database entities are templates, folders, and certificates. Storage buckets are templates
and certificates. Supabase Auth and optional Upstash Redis are additional dependencies.

The renderer imports the service-role client for uploaded-font downloads but does not import
Next.js server actions. This permits extraction of a Node-worker-compatible rendering service.
The existing issuance/PDF/email actions import next/cache and cookie authentication and cannot
be used unchanged by a standalone worker.

## Schema contract audit (VERIFIED)

Compared the database interfaces and actual query/insert/update paths with both SQL entry
points and every supplied migration. These are file comparisons, not a live catalog audit.

| Entity | Application contract | schema.sql | master_setup.sql | Existing migrations |
| --- | --- | --- | --- | --- |
| templates | 54 interface fields; editor settings and JSON placeholders | Missing 28 fields listed below | Missing link_color, name_color, event_color, date_color | Most missing fields covered; placeholders has no migration |
| certificates | 16 interface fields including custom_fields | Missing custom_fields | All interface fields present | No custom_fields migration |
| folders | id, name, parent_id, created_at, updated_at | Present | Present | Folder migration includes backfill and NOT NULL enforcement |

The 28 template fields absent from schema.sql are custom_fonts; link_font_size,
link_alignment, link_font_family, link_bold, link_italic, link_underline; name_width,
name_height, name_font_family, name_bold, name_italic, name_underline; event_width,
event_height, event_alignment, event_font_family, event_bold, event_italic,
event_underline; date_width, date_height, date_alignment, date_font_family, date_bold,
date_italic, date_underline; placeholders.

Additional deployment drift:

- README setup SQL lacks fields required by current actions and lacks folders.
- master_setup.sql drops existing tables; its early policy/trigger drops also reference
  tables that might not exist on a fresh database. It must not be the upgrade entry point.
- Historical migrations assume an existing base schema, overlap its definitions, and are
  not a verified clean-install chain. Do not blindly rerun historical security migrations.
- No supabase/config.toml or migration runner exists in this checkout.
- Newly created templates do not persist the built-in bold/italic/underline inputs in
  createTemplate(); editing uses a broader update payload. This is a rendering consistency
  issue to cover when freezing configuration.

## Foundation findings (VERIFIED)

| Concern | Evidence | Required change |
| --- | --- | --- |
| Trusted authorization | lib/auth/roles.ts uses app_metadata only; SQL is_admin() falls back to user_metadata | Align SQL with app_metadata and test forged user metadata |
| Anonymous data exposure | Public SELECT policy permits every valid certificate row | Remove direct public table reads; expose only an exact-code limited projection |
| Revoked screen unreachable | Verification SELECT includes is_valid=true | Fetch explicit public status, including revoked; avoid disclosing revoked recipient details unnecessarily |
| Revoked download bypass | Public API checks validity, but caches successful bytes; emails/cards use storage URLs | Use stable checked app downloads and no-store responses; move PDF bucket private |
| Template bucket mismatch | Uploads return getPublicUrl(); SQL comments recommend private templates | Explicitly provision templates as public-read design assets, admin-write; PDFs remain private |
| Legacy signed links | PDF creation signs for one year, stores tokenized URL, falls back to public URL | Store validated object paths; retain legacy URL column for compatibility during migration |
| Font CLI broken | TypeScript annotations in scripts/check-font-status.js | Make CLI valid JavaScript, load its own environment, avoid importing Next-specific TS modules |
| Local Supabase images | URL guard requires HTTPS and rejects private/reserved IPs | Local tests need injected asset I/O or a narrowly scoped trusted-storage adapter, not disabled SSRF guards |
| Missing rate limiting config | Upstash helpers allow requests when configuration is missing | Document and validate production requirements; do not claim a memory fallback exists |

Previously issued signed URLs and downloaded copies cannot be made revocable simply by
changing the application route. Rollout must inventory legacy links and cached responses;
an emergency token/key invalidation would be a separate operational decision. Do not promise
retroactive revocation of downloaded files.

## Durability and delivery findings (VERIFIED)

- Creation, PDF generation, and mail are separate operations with duplicated implementations.
- Only certificate_code is unique. Repeating a recipient import creates more certificates.
- Batch creation and PDF generation run sequentially within web request/action lifetimes.
- Bulk email jobs are held in a module-level array. They have no persisted lease, retry
  schedule, durable progress, or restart recovery.
- Bulk jobs use email_sent captured before enqueueing; overlapping jobs can duplicate mail.
- Some successful SMTP sends and PDF uploads ignore failure to persist their database state.
- calculateCooldown() returns one millisecond for every batch size.
- The bulk retry helper retries failures without distinguishing SMTP rejection from an
  ambiguous timeout after the server may have accepted a message.
- The single-email API has different retry/resend behavior from bulk actions.
- email_sent indicates a send result, not confirmed delivery; no attempts table or webhook exists.
- PDF generation uses the current template, not the captured template_image_url. A URL copy
  alone does not freeze rendering settings, image/font bytes, or the verification base URL.
- WebP is accepted by upload but is not converted for PNG/JPEG-only PDF embedding.
- Italic settings are not applied by drawTextWithAlignment().
- There is no unit/integration test suite or CI quality workflow; existing workflows ping Supabase.

## Proposed architecture for approval

### Queue alternatives

1. **Recommended: transactional Postgres job table.** issuance_items is the durable work
   queue. SQL RPCs claim rows with FOR UPDATE SKIP LOCKED, assign expiring leases and fencing
   tokens, and append transitions atomically. No extension or additional queue infrastructure
   is needed. The application must implement recovery/monitoring explicitly.
2. **Supabase Queues/PGMQ.** A supported Postgres-native queue with visibility windows and
   archival. Still needs issuance tables, fencing/idempotency, transactional enqueue, and
   ambiguous-SMTP handling. Requires enabling/provisioning the extension.
3. **Redis queue.** Adds a queue dependency and creates cross-store transaction concerns;
   existing Redis use is optional rate limiting. Not recommended for this rollout.

References checked: https://www.postgresql.org/docs/current/sql-select.html and
https://supabase.com/docs/guides/queues. Queue delivery guarantees do not make external SMTP
sending exactly once.

### State and invariants

- issuance_batches: creator, immutable request/idempotency key and payload digest, preview,
  approval, pause state, email option, counters, timestamps.
- issuance_items: stable recipient/source key, frozen recipient/render data, certificate
  reference, stage, attempts, next_run_at, lease expiry, owner/fencing token, last error.
- email_attempts: durable pre-send intent, stable Message-ID, provider, result classification,
  provider message reference, accepted/rejected/unknown outcome, timestamps.
- issuance_events: append-only transitions/failures, item/batch reference, actor and metadata.
- Add certificate render_snapshot, pdf_object_path, pdf_sha256, and issuance identity fields.
  Preserve pdf_url and email_sent as compatibility fields, never as the queue authority.
- Uniqueness covers a scoped batch request key plus payload digest, item source identity,
  and certificate issuance identity. Reject reuse of a key with different input. Do not
  impose new uniqueness on legacy recipient/event combinations or merge old records.
- Work advances through creation, PDF, and optional email stages. Certificate is_valid is
  independent from processing/delivery states. Revocation prevents new distribution/download.
- Claims are atomic. Every completion/heartbeat requires the current fencing token. Retry
  only safe stages with bounded exponential backoff. Expired pre-send processing leases may
  be reclaimed; expired send-intent stages become review-required, not automatic resend.
- Persist send intent before invoking SMTP. A timeout, lost acknowledgement, or crash after
  intent is conservatively unknown. Operator reconciliation is explicit and audited. SMTP
  acceptance is distinct from delivered; a stable Message-ID is correlation, not deduplication.
- Global provider pacing must hold across worker instances and manual sends, not just one
  process. Use a database-backed provider slot/reservation with bounded worker concurrency.
- Pause stops new claims; already-running safe stages finish. Check pause/revocation again
  before starting an email. Resume does not reset successful or unknown items.
- Retry failed items does not retry ambiguous email attempts. Manual resend remains available
  as an explicit audited new delivery request, subject to current state and authorization.

### Rendering and storage

- Approval freezes recipient values, template settings, base verification URL, renderer
  version, and content-addressed image/font assets. A JSON snapshot of mutable URLs is not
  sufficient. Resolve remote fonts into owned immutable assets before approval.
- Preserve existing historical PDFs. Historical rendering configuration cannot be inferred
  reliably; snapshot current configuration only when explicitly generating/regenerating.
- Generate deterministic metadata or reuse the persisted artifact; record SHA-256. Use
  conditional creation/content-addressed paths to survive upload-before-DB-commit crashes.
- Store PDF object paths, not signed tokens. Keep PDFs private and stream from the existing
  /api/verify/[code]/pdf route after a validity check. Return no-store/private caching headers.
- Use short-lived signed URLs only for explicitly permitted transient access. Never put
  those URLs in outbound emails. Legacy URL parsing must validate project/bucket/path and
  reject arbitrary URLs; cleanup must exclude query strings.
- New automated snapshots must own their asset lifecycle; deleting a template cannot delete
  snapshot assets required for outstanding or historical issuance.

### Web compatibility and UI

- Extract shared services without Next.js cookie/cache imports. Web entry points authenticate
  first; a standalone Node worker uses restricted server credentials and SQL RPC grants.
- Preserve existing pages, manual buttons, API paths, and response compatibility. Use
  compatibility adapters so bulk email UI can observe persisted jobs rather than run them.
- Add preview/validation and one Issue & Distribute approval action. Show durable progress,
  pause/resume, failed retry, and a separate review-required email state.
- Add CSV reports with escaped cells and spreadsheet-formula injection protection.
- Gmail remains the initial provider behind an interface. Record provider responses. Add
  authenticated, signature-verified and replay-safe webhook ingestion only for configured
  providers that support it; do not fabricate a Gmail delivery webhook.

## Proposed migration, deployment, and rollback sequence

New migrations use monotonically ordered versions after existing migrations. Never run
master_setup.sql on an existing deployment. First export the live catalog and compare it
with the contract; this checkout has no database credentials to do that now.

| Order | Additive change | Deployment dependency | Safe rollback |
| --- | --- | --- | --- |
| 1 | Repair missing template/custom-field columns; align trusted is_admin(); exact-code public projection; tighten table grants/policies; explicit template asset policy | Deploy public lookup adapter and SQL as a coordinated foundation release | Roll back to the patched adapter release, retain columns and security restrictions; do not restore broad public reads |
| 2 | Add issuance batches/items/attempts/events, uniqueness, RPCs, leases, transition constraints and worker-only grants | Apply with worker/automation disabled; test duplicate and interrupted transactions | Disable new enqueue/approval; stop claims and drain safe work; retain jobs/attempts/events |
| 3 | Add certificate snapshot/object-path/checksum fields and immutable asset support | Enable worker in generate-only mode, then preview/approval UI | Stop automated approvals/claims; retain artifacts, snapshots, and completed certificates |
| 4 | Inventory/backfill only validated legacy storage paths in chunks; private PDF access and stable URLs | Deploy compatible readers first, verify object access, then switch bucket private and outbound links | Keep private storage and stable reader; never restore public PDFs as rollback |
| 5 | Provider status/webhook constraints and operational indexes if needed | Enable production email explicitly after capture-transport tests and reviewed canary | Disable delivery/webhooks; retain ambiguous outcomes and logs for reconciliation |

Migration failure should roll back the transaction that is currently applying, not erase
previously issued data. Large backfills are separately restartable and report unresolved rows.
Avoid destructive down migrations: rollback is feature disablement and compatible application
rollback, with security and historical state retained. Review existing signing-token exposure
and CDN cache purge requirements before claiming immediate revocation for old links.

## Test and phase acceptance plan

1. Foundations: failing tests first for schema upgrade from both SQL variants, forged-role
   denial, anonymous enumeration denial, valid/revoked/unknown projection, revoked download,
   no-store responses, public template read/admin-only write, and runnable font CLI.
2. Durability: real SQL tests for concurrent claims, stale fencing token rejection, duplicate
   approval, upload-before-commit crash, worker death before/after SMTP intent, retry exhaustion,
   and conflicting idempotency payloads. Assert certificate/attempt/event counts.
3. Circulation: request/UI tests for preview-before-approval, optional email, browser disconnect,
   reconnect, pause/resume, failed retry, unchanged manual workflows, CSV escaping.
4. Delivery: fake-provider tests for safe rejection, accepted and unknown outcomes, global
   pacing across workers, private objects, legacy path parsing, stable links, webhook signatures
   and replay. Deny external network/real SMTP in all tests.
5. CI: lint, type checking, build, unit tests, and disposable-database integration/RLS tests.
   Build uses non-secret placeholders and must not access production Supabase. Database jobs
   must fail rather than silently skip requested integration tests.

Each phase report will list changed files, commands, exact results, untested paths, migration
requirements and operational risks. A fake repository can test orchestration, but cannot
prove PostgreSQL concurrency, RLS, storage behavior, or real SMTP delivery.

## Executed checks and current environment

- File/query/SQL inventory and schema/interface comparison: executed. Findings above confirmed.
- node scripts/check-font-status.js: executed, exit 1; SyntaxError at line 54, TypeScript
  annotation in JavaScript. This was a failure reproduction, not a passing test.
- Node v24.19.0 and npm 12.0.2 available.
- node_modules absent. Only .env.example is present; no configured local credentials.
- docker info: daemon unavailable (Docker Desktop Linux engine named pipe missing).
- psql and Supabase CLI were not found on PATH. No local Supabase configuration exists.
- git status: unavailable because this checkout has no .git directory.
- No application build, lint, unit, SQL integration, browser, or delivery test has been run.
- No mail sent, migrations applied, production data modified, commits made, or pushes made.

## Immediate next step

Approve the proposed transactional Postgres job-table architecture or select Supabase
Queues/PGMQ. Implementation then proceeds in the user's five phases, beginning with failing
foundation tests and additive migrations. The approval checkpoint comes from the installed
brainstorming skill; it is not a requirement imposed by this repository.
