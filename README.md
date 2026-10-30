# CredMark

TrueMark is a single-organization certificate application built with Next.js, Supabase, and a separate Node worker. Administrators design templates, issue certificates, generate PDFs, and distribute them by email. Public verification uses an exact certificate code and a checked download route.

## Local setup

Use Node 22.13 or newer. Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, and configure a development Supabase project. Never put service-role, database, Gmail, or integration credentials in public environment variables.

Database setup is additive. Review and back up the target database before running:

```sh
npm run migrate -- --check
# Set DATABASE_URL and explicitly set ALLOW_DATABASE_MIGRATIONS=true in the environment.
npm run migrate
npm run dev
```

The runner uses `supabase/schema.sql` only when the templates table is absent, then applies `202610250001_foundations.sql` and `202610250002_issuance.sql`. It records SHA-256 checksums under an advisory lock and refuses changes to applied files. Historical migration files are retained for reference; do not replay them or run `master_setup.sql` on an existing installation. A Supabase database with Auth and Storage schemas is required; a plain PostgreSQL database alone does not provide those services.

Create an administrator in Supabase Authentication, assign trusted `app_metadata.role = "admin"` using the dashboard or trusted SQL, and sign in at `/login`. User-editable metadata does not grant access. Set `ADMIN_PANEL_ENABLED=true`. Prepare a template through `/admin/templates`; create the first destination folder with the existing folder picker at `/admin/certificates/create` before choosing it in circulation.

## Issue and distribute

Open `/admin/circulation`, select or create an event, select a template and folder, and choose PDF-only or PDF plus email. Upload a CSV of up to 1,000 recipients / 2 MB. Map the name, email, optional stable recipient key, and custom placeholder columns. Review and edit the preview; duplicate normalized emails or recipient keys are rejected.

Create a frozen draft, review its recipients, and click **Issue & Distribute** to approve processing. Drafts do not process before approval. Snapshot assets and settings are retained independently of later template edits. Once approved, progress persists in PostgreSQL and the browser may close. Return to pause new claims, resume, retry confirmed failures, or export a CSV report. Existing manual routes and controls remain available and use persisted work where adapted.

Recipient identity defaults to trimmed lowercase email. Supply a stable source-system recipient key when addresses may change. Logical identity combines event ID, recipient key and certificate type across batches: matching later batches reuse the certificate; conflicting recipient/template values are rejected. Use a distinct event/type for a distinct award. Existing historical identities are not guessed or merged. Reuse a request idempotency key only for the same payload.

The worker runs independently:

```sh
npm run worker:check
npm run worker
```

A Vercel web deployment does not run this persistent worker. Run it on an always-on Node host with restart supervision. Default concurrency is two, leases are 120 seconds, and provider pacing is 3,000 ms. `EMAIL_PROVIDER=disabled` allows PDF-only startup without Gmail credentials; email stages fail closed. Use `EMAIL_PROVIDER=capture` for a staging/test canary: capture never sends mail and is forbidden in production. Gmail requires `EMAIL_PROVIDER=gmail`, Gmail credentials, and explicit `EMAIL_DELIVERY_ENABLED=true`; the delivery flag gates Gmail, not capture or disabled mode.

Email acceptance means the provider accepted a message, not that the recipient received it. Ambiguous attempts are held for review instead of automatic resend. Check evidence, supply an operator note, and explicitly record either acceptance or confirmed nonacceptance. Only confirmed failures may be retried. Gmail does not supply delivery webhooks; delivered/bounced status requires a supported, authenticated provider integration.

## Integration credentials

```sh
npm run integration:key -- --help
npm run integration:key -- --create --name=importer --scopes=batches:write,batches:read
```

Creation requires a server-only Supabase service-role key. Store the displayed token immediately in your integration secret store: the application stores only its SHA-256 hash. Send `Authorization: Bearer <token>` to the issuance API with the required scope. Credentials have independent revocation and rate limits. Never place these tokens in browser bundles, CSVs, or logs.

| Endpoint | Operation |
| --- | --- |
| `GET /api/issuance/events` | List reusable event IDs. |
| `POST /api/issuance/events` | Create `{name,date_of_issue,certificate_type}`. |
| `GET /api/issuance/batches` | List persisted batches. |
| `POST /api/issuance/batches` | Create a draft with `{event_id,template_id,folder_id,send_email,idempotency_key,recipients}`. Recipient values are `{name,email,recipient_key?,custom_fields?}`. |
| `GET /api/issuance/batches/[id]` | Read items, attempt outcomes, and actual summary counts. |
| `POST /api/issuance/batches/[id]` | Explicit `approve`, `pause`, `resume`, or `retry` action; authorized operators may reconcile with an attempt ID, outcome, and evidence note. |
| `GET /api/issuance/batches/[id]/report` | Download the batch CSV report. |

Use UUIDs for entity IDs and the idempotency key. `date_of_issue` is a real calendar date in `YYYY-MM-DD` form. Limit draft requests to 1,000 recipients and 2 MB; names are at most 120 characters, email/key values 254, and custom values 500. Batch reads require `batches:read`; ordinary mutations require `batches:write`; approval requires the separate `batches:approve` scope. The sample token cannot approve drafts. Event reads and mutations require `events:read` and `events:write` respectively; request those scopes explicitly when creating a credential that manages events. Reconciliation requires an administrator session and an evidence note of at least ten characters. Do not automatically approve data received from an untrusted caller.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:postgres
npm run worker:check
npm run fonts:check
npm run migrate -- --check
npm run build
```

Tests use capture/fake providers and block real SMTP. Most database tests use embedded PostgreSQL (PGlite); `test:postgres` additionally requires `DATABASE_TEST_URL` pointing at disposable local PostgreSQL and exercises multiple connections. Missing or nonlocal database configuration fails that command. CI provisions PostgreSQL 16 and uses nonsecret build placeholders. CI configuration is not evidence that a hosted workflow has run.

See [DEPLOY.md](DEPLOY.md) for rollout, [decisions.md](decisions.md) for design choices, [flow.md](flow.md) for processing states, and [handoff.md](handoff.md) for verification and remaining operational work. The earlier [code audit](docs/automation-current-code-audit.md) describes the preimplementation checkout and proposed design, not current acceptance results.
