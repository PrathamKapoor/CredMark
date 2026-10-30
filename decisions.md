# Implementation decisions

The approved design uses PostgreSQL as the durable queue. Claims lock eligible rows with `FOR UPDATE SKIP LOCKED`; leases and fencing tokens reject stale completions. Queue state persists independently of web requests and worker processes. This avoids a second queue datastore but requires worker operation and queue monitoring.

Batch drafts freeze recipient values, template settings, verification origin, renderer metadata, and owned image/font assets. Template edits must not alter an approved issuance. Snapshot storage is private and independent of the mutable template lifecycle. Draft creation does not authorize processing; explicit approval does.

Stable recipient keys default to normalized email. Logical issuance identity combines event ID, recipient key and certificate type across batches. A matching later batch reuses the certificate and frozen snapshot; conflicting recipient/template values are rejected. Submission idempotency separately checks a creator-scoped request key and payload digest. Historical rows are preserved without guessing identities or merging names. Use a distinct event/type for an intentional distinct award.

SMTP cannot provide exactly-once delivery. Persist send intent before the provider call, classify acceptance separately from delivery, and hold lost acknowledgements/crashes as ambiguous. Unknown attempts are not automatically retried. Explicit operator reconciliation records evidence; confirmed failure permits a later retry. Message-ID supports correlation, not provider deduplication. Provider pacing and suppression are database-backed.

Authorization trusts Supabase `app_metadata`, never user-editable metadata. Public verification returns a limited exact-code projection rather than anonymous certificate-table enumeration. Checked downloads revalidate revocation and avoid shared caching. Previously downloaded artifacts and old signed links have separate lifecycle limits.

Schema changes are additive and migration history is checksum-protected. Fresh Supabase installations use the canonical safe schema; upgrades use only the new ordered foundation and issuance migrations. Historical migrations and `master_setup.sql` are not an upgrade runner. Rollback disables new activity and retains records and security restrictions.

The UI and existing manual workflows coexist. Durable work is performed by a separately supervised Node process; deploying Next.js to Vercel alone does not run it. API integrations use scoped, revocable, rate-limited tokens stored only as SHA-256 hashes. The application remains single-organization; no tenant isolation claim is made.

Tests use capture/fake mail and embedded PostgreSQL for repeatable coverage. A separate disposable PostgreSQL test exercises concurrent connections and locking. Neither substitutes for a deployed Supabase Auth/Storage canary or a deliberately enabled provider canary. Dependency vulnerabilities require targeted review; broad automated upgrades were excluded from this implementation.

Manual regeneration rerenders frozen inputs instead of silently adopting template edits. Existing historical PDFs without a snapshot are adopted byte-for-byte; explicit regeneration is needed to capture current settings when original rendering inputs are unknown. Missing frozen fonts fail instead of fetching mutable runtime fonts.

Next.js was upgraded to 16.4.3 for concrete critical advisories within the original compatible major. The 16.2 patch line did not contain the required fixes. Remaining dependency advisories and verification limits are recorded in handoff.md.
