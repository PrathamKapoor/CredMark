# Deploying TrueMark

The web application and durable worker are separate deployments sharing Supabase. This is a single-organization installation. Production rollout requires a reviewed database backup, schema inspection, environment configuration, and a capture-first canary. Source implementation and local tests do not establish production readiness.

## Prepare the database

1. Back up PostgreSQL and inventory Storage objects and bucket policies. Export the live catalog and compare it with the supplied schema before upgrading. Preserve existing certificates and legacy columns.
2. Stop web mutation traffic (stop the web service or apply maintenance routing at its gateway) and stop workers while applying the foundation release. Coordinate the patched exact-code public reader with the new restricted table policies; broad anonymous table reads must not be restored.
3. Set a direct/session `DATABASE_URL` in a trusted terminal. Run `npm run migrate -- --check` to inspect the ordered file checksums without connecting. Set `ALLOW_DATABASE_MIGRATIONS=true`, then run `npm run migrate`. Unset that flag afterward.
4. The runner locks the session, creates `public.schema_migrations`, and wraps each file and its history insertion in one transaction. Applied checksums are immutable. An empty Supabase installation receives canonical `schema.sql` followed by the two new migrations. An existing installation receives only the new migrations. Do not execute `master_setup.sql` or blindly replay the old migration chain.
5. Verify admin roles come only from trusted `app_metadata`, anonymous enumeration is denied, exact-code valid/revoked/unknown verification behaves correctly, and revoked PDFs cannot be downloaded through the application route.

The migration runner assumes Supabase Auth and Storage already exist. It does not provision a Supabase project. Database connection details may contain secrets; keep them outside shell transcripts and source control.

## Web configuration

Configure the variables in `.env.example`: the Supabase project URL and public key; server-only service-role key; canonical HTTPS application URL; `ALLOWED_ORIGINS`; and production Upstash rate-limit credentials. Configure Supabase Auth redirects for the deployment origin. Keep `ADMIN_PANEL_ENABLED` consistent with the intended public access policy.

Create administrator accounts in Supabase Authentication. Assign `app_metadata.role = 'admin'` through a trusted dashboard or SQL operation; never use user-editable metadata. For an existing account, the following explicitly targeted example preserves its other app metadata:

```sql
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'admin@example.org';
```

Replace the example account deliberately, then refresh its session and sign in at `/login`. There is no public administrator signup endpoint. Create the first template in Templates and a destination folder through the existing certificate-creation folder picker before creating a circulation draft.

Deploy Next.js to the selected host, including Vercel if desired. Use a build with nonsecret placeholders in CI; production credentials belong in the hosting secret store. Do not instantiate an email provider or contact production Supabase during a build.

Template design images are public-read/admin-write assets. Certificate PDFs and immutable snapshot assets remain private. Store validated object paths and use `/api/verify/[code]/pdf` for downloads after validity checks, with private/no-store responses. Backfill legacy PDF paths only after validating the project, bucket, and object path; preserve unresolved records for investigation.

Inventory previously issued signed/public links and CDN caches before asserting revocation behavior. Switching to checked downloads does not invalidate old downloaded copies or all previously issued signed URLs. Token invalidation or cache purging is a separate operational action.

Use `npm run pdf:backfill` for a read-only inventory of legacy PDF URLs. After reviewing its counts, `npm run pdf:backfill -- --apply` stores validated own-project paths using cursor pagination and conditional updates. Unresolved rows remain untouched. This neither regenerates/deletes objects nor invalidates old tokens. Historical PDFs retain their original bytes; missing original rendering settings are not fabricated.

## Worker and email rollout

Run `npm run worker` under a service manager on an always-on Node host. Serverless web requests are not the worker lifecycle. Supply the same Supabase project and server credential through its secret store. Use one organization per deployment. Keep concurrency and lease settings conservative; provider reservations coordinate pacing across worker instances.

Set `NODE_ENV=production` on the production worker host. Capture transport is for a separate nonproduction database only; production mode rejects it. The web and worker installs need the runtime dependencies; `tsx` and `pg` are classified accordingly in the lockfile.

First run `npm run worker:check`. Use `EMAIL_PROVIDER=disabled` for PDF-only startup without Gmail credentials; email stages fail closed. Run a development/staging canary with capture transport to inspect email generation without sending. Confirm immutable assets, private storage, pause/resume, restart recovery, idempotent submission, and CSV reports. Production capture mode is deliberately rejected. `EMAIL_DELIVERY_ENABLED=true` gates Gmail delivery only.

After reviewing captured mail and the canary, configure `EMAIL_PROVIDER=gmail`, Gmail app credentials, and `EMAIL_DELIVERY_ENABLED=true`. Enable actual production delivery only for an explicitly reviewed small batch. Monitor provider acceptance separately from confirmed delivery, suppressed addresses, failed stages, lease expiry, and review-required items. Do not infer inbox delivery from SMTP success. Do not automatically retry an ambiguous send or reset its state to queued.

For uncertain SMTP outcomes, inspect provider evidence and use the circulation review control with an operator note and explicit confirmation. Record acceptance only when supported; record failure only when nonacceptance is confirmed. Retrying confirmed failures is a separate operator action. Gmail has no delivery webhook in this implementation. Configure webhook secrets only for an explicitly supported provider and verify signatures, freshness, and replay protection before enabling ingestion.

The optional `/api/delivery-events` endpoint uses a gateway contract, not a native Gmail webhook. Configure `EMAIL_WEBHOOK_PROVIDER` and `EMAIL_WEBHOOK_SECRET` only for a trusted gateway that first verifies its upstream provider evidence. Submit raw JSON `{event_id,provider_id,status}` with status `delivered` or `bounced`; `provider_id` must correlate with a recorded attempt. Send a ten-digit Unix-seconds `x-truemark-timestamp` and `x-truemark-signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`. The endpoint enforces a five-minute time window and a 16 KB body limit; database event IDs prevent replay. No native provider adapter or delivery proof is fabricated by setting a provider name.

Existing manual controls remain available. Where adapted, their work enters the durable queue rather than depending on an open browser request. Monitor both entry points through the same provider pacing and suppression rules.

## Credentials and maintenance

Create integration credentials using `npm run integration:key -- --create --name=... --scopes=batches:write,batches:read`. Store the once-displayed raw token in the caller's secret store. To revoke, set its `integration_credentials.revoked_at` through a trusted admin operation. Rotate secrets after exposure; database hashes cannot reconstruct tokens.

The retained optional keepalive workflows use `SUPABASE_URL` secrets. They are not health checks or deployment validation; configure their secrets only if those workflows are intentionally enabled. The REST workflow also requires its declared key and health-check endpoint.

## Rollback

Stop new approvals, disable delivery, and stop claims before rolling back application code to a compatible patched release. Allow safe in-flight stages to settle where possible. Retain issued certificates, snapshots, PDFs, jobs, attempts, audit events, and migration history. Do not drop new tables, replay destructive setup SQL, restore broad public reads, or make certificate storage public. Reconcile unknown email outcomes before further sending. Restore backups only through a separately reviewed recovery procedure.

## Acceptance record

Run the documented lint, type, unit, integration, worker, font, migration-plan and build checks. Real local PostgreSQL tests require a disposable instance and fail if missing. Complete a live Supabase/Auth/Storage canary and a reviewed delivery canary before production enablement. Record commands, exact results, deployment versions, backup reference, unresolved legacy links, and responsible operator in `handoff.md`. An existing dependency audit reported 16 vulnerabilities; review that baseline and targeted fixes rather than blindly upgrading dependencies.
