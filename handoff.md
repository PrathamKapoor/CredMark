# TrueMark implementation handoff

Date: 2026-10-25. Workspace: C:\Projects\TrueMark-master.

## Repository state

The supplied directory has no .git metadata. Initial git status --short, git branch --show-current, git rev-parse HEAD, and git remote -v all failed with "not a git repository." Branch, HEAD, remotes, upstream and history could not be verified. No replacement history was initialized. No commits or pushes were made, so there are no commit SHAs or hosted CI results. The requested identity for future commits in the real checkout is PrathamKapoor <prathamkapoor027@gmail.com>.

The original docs/automation-current-code-audit.md is preserved. docs/implementation-files.md lists 51 created and 41 modified files, including that inventory and excluding dependencies/generated files. Historical migration files other than the trusted-role fix retain their logic; their line endings were normalized. Ordinary upgrades do not replay them.

npm/package-lock.json remains authoritative. npm ci succeeded before adding Vitest, tsx, PGlite, pg and pg types for tests, worker execution and guarded migration tooling. Next.js was intentionally updated from 16.2.0 to 16.4.3 for critical security advisories. The latest 16.2 patch did not contain the necessary fixes. No forced broad dependency update was used.

tsx and pg are runtime dependencies so worker/migration commands survive an install that omits development dependencies. Test frameworks and type packages remain development-only. The final packaging command was npm install --save-prod tsx@^4.23.15 pg@^8.23.1 (exit 0, installed versions unchanged).

## Implemented phase results

| Phase | Implementation | Exercised evidence / limits |
| --- | --- | --- |
| 1: foundations | Safe schema/setup, additive repair migration, trusted-role policies, exact-code verification, private checked downloads, font CLI, WebP/italic/color/link rendering | PostgreSQL upgrade tests cover schema/master/old README variants, preserve records, replay migration, deny forged roles and anonymous enumeration, and defeat a legacy permissive storage policy. Real pdf-lib/sharp/fonts exercised. Hosted Auth/Storage is unverified. |
| 2: durable engine | Persistent batches/items/attempts/events, atomic claims, leases/fencing, retries, pacing, suppression and independent worker | SQL tests cover idempotency/conflicts, expiry/stale workers, pause/retry, send ambiguity, accepted-send recovery and reconciliation. PGlite is serialized: separate-connection contention remains unverified locally. |
| 3: circulation | Event and batch APIs, CSV mapping/editing, frozen draft/approval, automated stages, manual adapters, persisted polling | Actual API draft/approval handlers and the SQL/rendering worker process 100 recipients. UI initial render is tested; interactive browser end-to-end is unverified. |
| 4: distribution | Provider interface, Gmail/disabled/capture modes, structured attempts, delivery gateway, reports and stable paths | Fake providers, signature handling, bounce suppression and replay protection tested. No actual SMTP delivery or gateway interoperability claim. |
| 5: integration/release | Scoped hashed credentials, quotas/body bounds, submission/status/approval/report endpoints, CI and migration/legacy tools | Scope/origin/size checks passed. CI provisions PostgreSQL 16 but has not run remotely. Offline CLI checks passed; production changes were not applied. |

Primary services are lib/issuance/{service,repository,worker,artifacts,domain}.ts. The new administrator entry point is /admin/circulation. Existing creation/template/management/PDF/email routes and controls remain. Email actions now queue and report actual persisted progress rather than an immediate send. Certificates referenced by issuance history are protected from hard deletion; revoke them instead. Failed deletes leave their PDF objects intact.

## Schema, security and processing behavior

- schema.sql and master_setup.sql are non-destructive, idempotent fresh setup scripts. The new runner uses canonical schema only for a fresh Supabase database.
- 202610250001_foundations.sql repairs all required template/certificate fields, creates legacy folders if absent, backfills missing assignments into Uncategorized, replaces untrusted metadata authorization and broad table policies, and reconciles bucket access. Anonymous users get only a limited exact-code verification projection.
- 202610250002_issuance.sql adds events, issuance_batches, issuance_items, email_attempts, job_events, provider_pacing, email_suppressions, delivery_events, integration_credentials and quota tables. Queue mutations use service-only RPCs; trusted administrators may inspect appropriate records.
- Valid, revoked and unknown are distinct public states. Revoked recipient details are redacted. Legacy eight-character codes remain supported. Controlled downloads check validity and return private/no-store responses. A restrictive policy prevents unknown broad storage policies from exposing private artifacts.
- Template images/fonts are public design assets with administrator-only writes. PDFs and snapshot assets are private. New emails use application download/verification links, never saved long-lived storage signatures. Validated legacy own-project URLs remain readable by object path.
- Logical identity is event ID + recipient key + certificate type. Matching later batches reuse a certificate and frozen rendering; conflicting recipient/template/custom values fail instead of distributing the original recipient's record. Request keys are creator-scoped and also compare payload digests.
- Each worker stage needs an unexpired lease and fencing token. Safe failures retry with bounded database backoff/jitter. Provider pacing is shared across workers. Worker process concurrency is bounded and shutdown stops new claims; a database failure stops all claim loops for supervisor restart.
- An email attempt freezes the locked recipient and message envelope before SMTP. Active/uncertain sends block address edits. Provider acceptance is distinct from delivery. Known accepted sends recover as completed even if later completion fails. Ambiguous outcomes stop for evidence-based operator reconciliation and cannot automatically resend.
- Frozen template settings and owned image/font bytes preserve rendering. Deterministic PDF output and SHA-256 paths recover an upload-before-commit failure. WebP and italics render; tests inspect actual PDF string-valued hyperlink annotations.
- Existing historical PDF bytes are adopted/checksummed without inventing original rendering settings. Explicit regeneration captures settings if the legacy snapshot is absent; later regeneration uses frozen inputs. Historical records are not guessed or merged into event identities by name.
- Dashboard counts come from actual items, artifact metadata and attempt outcomes. The current-stage retry count is separate from full attempt/event history. CSV output escapes cells and guards spreadsheet formulas.

## Exact verification record

| Command | Observed result |
| --- | --- |
| npm ci | Exit 0; installation from original lockfile. |
| npm install --save-dev vitest@^4 tsx@^4 @electric-sql/pglite pg @types/pg | Exit 0; justified tooling added to lockfile. |
| npm install next@^16.2.0 | Exit 0; final installed version 16.4.3, package floor updated accordingly. |
| npm test | Exit 0: 58 tests in 15 files, final run 46.17 seconds after queue-lock refinement and runtime packaging. |
| npm run test:unit | Exit 0: 41 tests in 13 files, 8.41 seconds. This group includes the focused foundation SQL fixture. |
| npm run test:integration | Exit 0: 17 tests in 2 files; repeated after claim-lock refinement (46.79 seconds). SQL and pipeline integration use PGlite. |
| npm run typecheck | Exit 0; standalone TypeScript passed. Final production build also type-checked final source. |
| npm run lint | Exit 0: zero errors, 13 nonblocking image/unused-declaration warnings. No lint rules disabled. |
| npm run build | Exit 0 under Next.js 16.4.3; compiled and generated all route output, including circulation/issuance/delivery routes. |
| npm run worker:check | Exit 0; independent worker modules loaded without network/send. |
| npm run fonts:check | Exit 0; repaired JavaScript font CLI self-test. |
| npm run migrate -- --check | Exit 0; ordered files/checksums validated offline. |
| npm run integration:key -- --help | Exit 0; no token created. |
| npm run pdf:backfill -- --help | Exit 0; no records/objects changed. |
| npm run test:postgres | Exit 1: DATABASE_TEST_URL is required; PostgreSQL integration tests cannot be skipped. |

The 100-recipient test exercises actual draft/approval API handlers, actual SQL functions, QueueRepository, bounded worker orchestration, real pdf-lib/sharp rendering and SHA-256 verification. It verifies 100 PDFs, 100 fake-provider acceptances, 100 attempts and zero asserted deliveries. Same-key resubmission and a matching logical batch do not add certificates or sends. Other pipeline cases exercise upload-before-commit recovery, SMTP timeout quarantine/no replay, historical PDF preservation and post-generation revocation.

PGlite is real embedded PostgreSQL but uses a serialized connection. These tests do not prove concurrent independent-connection locking. Storage is an in-memory external boundary and SMTP uses fake/capture providers. Authentication tests control the Auth boundary and also exercise SQL roles/RLS. No real recipient mail was sent, no production Supabase data was modified and no deployment was performed.

## Blocked / unverified boundaries

- BLOCKED: Docker is installed but its Linux-engine daemon pipe is unavailable. No disposable PostgreSQL URL, psql or Supabase CLI was available. The multi-connection check is implemented and configured in CI but needs that external service.
- BLOCKED: Automatic approval review rejected the local production server-start command with "blocked by policy" and gave no more specific reason. API handlers and initial UI render are tested; no live HTTP/browser smoke success is claimed.
- IMPLEMENTED BUT UNVERIFIED: Hosted Supabase Auth/Storage, deployed migrations, live Gmail acceptance, external gateway evidence, worker-host supervision and backup/restore. These require a configured staging/canary environment.
- BLOCKED: Commits/publishing require the original Git checkout/history and verified destination/permissions. Nothing was initialized, committed or pushed here.
- REMAINING SECURITY WORK: Final npm audit reports 14 advisories: 9 high, 4 moderate, 1 low, zero critical. Direct Nodemailer/Sharp/Zod and transitive advisories remain; major upgrades need targeted compatibility/security work. This is not production certification.
- LIMITATIONS: Downloaded copies cannot be retracted. Previously issued signed links/cached content may remain accessible until expiry or separate invalidation/purge. Revocation cannot recall SMTP already in flight. Configure production Upstash limits and the deployment's trusted forwarded-IP boundary.

## Deployment and recovery

1. Apply these files to the correct Git checkout, preserving its history and unrelated work, and create verified local commits there using the requested identity. Do not push without verifying the destination, branch and authorization.
2. Back up PostgreSQL/Storage and compare live schema/policies. Stop new approvals and worker claims during the coordinated public reader/security migration release.
3. Configure secrets. Inspect npm run migrate -- --check. Only with the intended DATABASE_URL and ALLOW_DATABASE_MIGRATIONS=true run npm run migrate. Fresh Supabase: canonical schema, 001, 002. Existing installation: 001, 002. History/checksums are transactional; do not replay old migrations or reset production tables.
4. Use npm run pdf:backfill for read-only legacy inventory. Review unresolved records, then optionally use --apply for conditional validated path backfill. It never deletes/regenerates objects or invalidates old tokens.
5. Run the web process and a separately supervised npm run worker on an always-on Node host. Vercel web deployment alone does not process jobs. EMAIL_PROVIDER=disabled permits PDF-only startup. Capture is nonproduction. Gmail requires credentials plus explicit EMAIL_DELIVERY_ENABLED=true.
6. In /admin/circulation choose/create event, template and folder, map/edit CSV, save a frozen draft and approve once. Return for persisted progress, pause/resume, safe failed retry, provider outcomes, reconciliation and CSV report. Browser closure does not own or cancel the job.
7. Run a staging Auth/Storage and supervised-worker canary with crash/ambiguity scenarios. Separately authorize a small real-send canary. Gmail has no native delivery webhook here; the optional signed gateway must verify genuine upstream evidence.
8. Roll back by disabling approvals/delivery/claims and deploying a compatible patched application. Retain private storage, security restrictions, jobs, attempts, snapshots, certificates, events and migration history. Do not drop tables, broaden public reads or auto-retry unresolved sends. See DEPLOY.md.

This record describes implementation and local evidence, not a production deployment.
