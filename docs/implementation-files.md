# Implementation file inventory

This export has no Git metadata. New paths were compared with the initial file inventory; modified paths were collected by this implementation session. Generated build/type files and dependencies are excluded. The original audit document is preserved.

## Created (51)

- `.github/workflows/ci.yml`
- `app/admin/circulation/CirculationClient.tsx`
- `app/admin/circulation/circulation.css`
- `app/admin/circulation/page.tsx`
- `app/api/delivery-events/route.ts`
- `app/api/issuance/batches/[id]/report/route.ts`
- `app/api/issuance/batches/[id]/route.ts`
- `app/api/issuance/batches/route.ts`
- `app/api/issuance/events/route.ts`
- `decisions.md`
- `docs/implementation-files.md`
- `flow.md`
- `handoff.md`
- `lib/email/provider.ts`
- `lib/email/webhook.ts`
- `lib/issuance/artifacts.ts`
- `lib/issuance/csv.ts`
- `lib/issuance/domain.ts`
- `lib/issuance/http.ts`
- `lib/issuance/repository.ts`
- `lib/issuance/service.ts`
- `lib/issuance/validation.ts`
- `lib/issuance/worker.ts`
- `lib/storage/paths.ts`
- `lib/verification/public.ts`
- `scripts/backfill-pdf-paths.ts`
- `scripts/integration-key.ts`
- `scripts/issuance-worker.ts`
- `scripts/migrate.ts`
- `scripts/test-postgres.ts`
- `supabase/migrations/202610250001_foundations.sql`
- `supabase/migrations/202610250002_issuance.sql`
- `tests/certificate-actions.test.ts`
- `tests/csv.test.ts`
- `tests/db.test.ts`
- `tests/delivery.test.ts`
- `tests/foundations-download.test.ts`
- `tests/foundations-manual.test.ts`
- `tests/foundations-sql.test.ts`
- `tests/foundations.test.ts`
- `tests/helpers/database.ts`
- `tests/helpers/supabase-adapter.ts`
- `tests/http.test.ts`
- `tests/issuance-domain.test.ts`
- `tests/issuance-validation.test.ts`
- `tests/pipeline.test.ts`
- `tests/rendering.test.ts`
- `tests/setup.ts`
- `tests/webhook.test.ts`
- `tests/worker.test.ts`
- `vitest.config.mts`

## Modified (41)

- `.env.example`
- `.github/workflows/superbase-keepalive.yml`
- `DEPLOY.md`
- `README.md`
- `app/actions/certificates.ts`
- `app/actions/email.ts`
- `app/actions/font-management.ts`
- `app/actions/pdf.ts`
- `app/actions/templates.ts`
- `app/admin/AdminLayoutClient.tsx`
- `app/admin/certificates/BulkEmailSender.tsx`
- `app/admin/certificates/CertificateCard.tsx`
- `app/admin/certificates/CertificatesHeader.tsx`
- `app/admin/templates/create/CreateTemplateForm.tsx`
- `app/api/certificates/[id]/email/route.ts`
- `app/api/certificates/[id]/pdf/route.ts`
- `app/api/certificates/bulk-email/route.ts`
- `app/api/diagnostics/template-fonts/route.ts`
- `app/api/verify/[code]/pdf/route.ts`
- `app/verify/[code]/page.tsx`
- `instrumentation.ts`
- `lib/email/bulk-email-queue.ts`
- `lib/email/send-certificate.ts`
- `lib/pdf/generate-certificate.ts`
- `lib/types/database.ts`
- `lib/utils/certificate-code.ts`
- `lib/utils/email-utils.ts`
- `lib/utils/font-registration-helper.ts`
- `package-lock.json`
- `package.json`
- `scripts/check-font-status.js`
- `supabase/master_setup.sql`
- `supabase/migrations/20260107_add_template_flexibility.sql`
- `supabase/migrations/20260117_add_font_family.sql`
- `supabase/migrations/20260117_add_text_styling.sql`
- `supabase/migrations/20260202_security_fixes.sql`
- `supabase/migrations/20260319_add_certificate_folders.sql`
- `supabase/migrations/20260319_public_verification_rls_hardening.sql`
- `supabase/migrations/20260320_add_custom_font_files.sql`
- `supabase/migrations/20260327_add_template_text_colors.sql`
- `supabase/schema.sql`

Historical SQL migration files other than the trusted-role fix retain their prior logic; their line endings were normalized during foundation work. Ordinary upgrades use the two new migrations, not replay of the historical chain.
