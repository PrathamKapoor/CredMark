# 🔐 Security & Code Integrity Audit Report

## 1. Executive Summary

Overall security posture: Moderate to High risk.

Production readiness level: 58/100

Risk classification: High

Key concerns:
- Broken access control risk from multiple client-reachable server actions that do not enforce explicit admin authorization at function entry.
- Rate limiting is fail-open when Upstash is missing, allowing unrestricted login and public PDF attempts.
- Unvalidated dynamic URI values are embedded into PDF link annotations.
- Public PDF retrieval trusts stored URLs without host/scheme revalidation.
- Several mutating and bulk endpoints lack strict payload constraints and return low-level error details in server actions.

What is working well:
- SQL/RLS model is present and generally sane for admin-only mutation plus public verification reads in [supabase/master_setup.sql](supabase/master_setup.sql#L251).
- Origin checks are present on mutating API routes such as [app/api/certificates/bulk-create/route.ts](app/api/certificates/bulk-create/route.ts#L83).
- Public verification route scopes certificate fields and validity checks in [app/api/verify/[code]/pdf/route.ts](app/api/verify/[code]/pdf/route.ts#L36).

## 2. Critical Findings

### 2.1 Missing Explicit Admin Guard In Client-Reachable Server Actions

Location:
- [app/actions/certificates.ts](app/actions/certificates.ts#L137) function updateCertificateEmail
- [app/actions/certificates.ts](app/actions/certificates.ts#L319) function createCertificate
- [app/actions/certificates.ts](app/actions/certificates.ts#L513) function updateCertificateValidity
- [app/actions/certificates.ts](app/actions/certificates.ts#L726) function updateCertificatePdfUrl
- [app/actions/certificates.ts](app/actions/certificates.ts#L746) function markEmailSent
- [app/actions/templates.ts](app/actions/templates.ts#L101) function createTemplate
- [app/actions/templates.ts](app/actions/templates.ts#L182) function updateTemplate
- [app/actions/pdf.ts](app/actions/pdf.ts#L171) function generateBulkPdfs
- [app/actions/email.ts](app/actions/email.ts#L28) function getCertificatesReadyForEmail
- [app/actions/email.ts](app/actions/email.ts#L66) function sendSingleCertificateEmail
- [app/actions/email.ts](app/actions/email.ts#L117) function sendBulkEmails
- These actions are invoked from client components, for example [app/admin/certificates/CertificateCard.tsx](app/admin/certificates/CertificateCard.tsx#L20), [app/admin/templates/create/CreateTemplateForm.tsx](app/admin/templates/create/CreateTemplateForm.tsx#L15), [app/admin/certificates/create/CreateCertificateForm.tsx](app/admin/certificates/create/CreateCertificateForm.tsx#L19), [app/admin/certificates/BulkPdfGenerator.tsx](app/admin/certificates/BulkPdfGenerator.tsx#L6).

Category: Security + Incomplete Implementation (Broken Authentication/Authorization)

Severity: Critical

What is happening:
- A number of sensitive server actions execute DB mutations or sensitive reads without calling requireAdminUser at function start.
- Some neighboring functions do enforce admin checks, proving inconsistency, such as [app/actions/certificates.ts](app/actions/certificates.ts#L535) and [app/actions/templates.ts](app/actions/templates.ts#L224).

Why it is dangerous:
- Authorization is currently partly delegated to route/UI access and RLS behavior. This is brittle.
- If RLS policies drift, action identifiers leak, or admin UI gating regresses, sensitive actions become callable.

Real-world attack/failure scenario:
- A non-admin authenticated user obtains or replays an exposed server action endpoint identifier for updateCertificateValidity and revokes certificates at scale.
- A deployment with temporarily relaxed RLS allows bulk record mutation through these actions with no explicit app-layer admin check.

Evidence:

    export async function updateCertificateValidity(
        id: string,
        isValid: boolean
    ): Promise<{ success: boolean; error?: string }> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('certificates')
            .update({ is_valid: isValid })
            .eq('id', id);

Contrast with guarded function in same file:

    export async function deleteCertificate(id: string): Promise<{ success: boolean; error?: string }> {
        const adminCheck = await requireAdminUser();
        if (!adminCheck.ok) {
            return { success: false, error: adminCheck.error };
        }
        ...
    }

Fix (secure code):

    import { requireAdminUser } from '@/lib/auth/admin';

    async function requireAdminOrThrow() {
      const admin = await requireAdminUser();
      if (!admin.ok) {
        throw new Error('Forbidden');
      }
      return admin.user;
    }

    export async function updateCertificateValidity(id: string, isValid: boolean) {
      await requireAdminOrThrow();
      const supabase = await createClient();

      const { error } = await supabase
        .from('certificates')
        .update({ is_valid: isValid })
        .eq('id', id);

      if (error) {
        return { success: false, error: 'Operation failed' };
      }

      return { success: true };
    }

Apply this pattern to every sensitive action listed above.

### 2.2 Rate Limiting Fails Open When Upstash Is Missing

Location:
- [lib/utils/rate-limit.ts](lib/utils/rate-limit.ts#L75)
- [lib/utils/rate-limit.ts](lib/utils/rate-limit.ts#L112)
- [lib/utils/rate-limit.ts](lib/utils/rate-limit.ts#L138)
- [lib/utils/rate-limit.ts](lib/utils/rate-limit.ts#L154)

Category: Security Misconfiguration

Severity: Critical

What is happening:
- If Upstash is not configured, limiter returns null and all checks resolve to allowed true.

Why it is dangerous:
- Login brute-force and public PDF abuse protections are effectively disabled in misconfigured environments.

Real-world attack/failure scenario:
- An attacker performs unlimited credential stuffing attempts against admin login where UPSTASH vars were omitted in production.

Evidence:

    if (!limiter) {
        return null;
    }

    ...

    return { allowed: true };

Fix (secure code):

    const enforceStrict = process.env.NODE_ENV === 'production';

    if (!upstashDecision) {
      if (enforceStrict) {
        return {
          allowed: false,
          retryAfter: 60,
          message: 'Rate limiter unavailable. Try again shortly.',
        };
      }
      // Dev fallback only
      return localInMemoryRateLimit(key);
    }

Also add startup health checks that fail deployment if production lacks UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.

### 2.3 Unvalidated Custom URI Injection Into PDF Link Annotations

Location:
- [lib/pdf/generate-certificate.ts](lib/pdf/generate-certificate.ts#L360)
- [lib/pdf/generate-certificate.ts](lib/pdf/generate-certificate.ts#L367)
- [lib/pdf/generate-certificate.ts](lib/pdf/generate-certificate.ts#L383)

Category: Security (Injection)

Severity: High

What is happening:
- Arbitrary custom_fields values are inserted into PDF URI actions when placeholder.isLink is true.

Why it is dangerous:
- Malicious links such as javascript:, file:, custom app schemes, or phishing URLs can be embedded into official certificates.

Real-world attack/failure scenario:
- A compromised admin account (or import pipeline) injects a phishing URL into certificates; recipients trust the document and click malicious links.

Evidence:

    const customValue = certificate.custom_fields?.[placeholder.key] || '';
    if (placeholder.isLink) {
      ...
      URI: customValue,
    }

Fix (secure code):

    function validatePublicHttpsUrl(value: string): string {
      let u: URL;
      try {
        u = new URL(value);
      } catch {
        throw new Error('Invalid link placeholder URL');
      }

      if (u.protocol !== 'https:') {
        throw new Error('Only https links are allowed');
      }

      if (u.username || u.password) {
        throw new Error('Credentials in URL are not allowed');
      }

      return u.toString();
    }

    const safeLink = validatePublicHttpsUrl(customValue);
    ...
    URI: safeLink,


## 3. Other Findings (Grouped by Severity)

### High

#### 3.1 Public PDF Route Trusts Stored URL And Performs Server-Side Fetch

Location:
- [app/api/verify/[code]/pdf/route.ts](app/api/verify/[code]/pdf/route.ts#L55)

Category: Security (SSRF / Trust Boundary)

Severity: High

What is happening:
- Public endpoint fetches certificate.pdf_url directly, without re-validating host/scheme against allowlist.

Why it is dangerous:
- If pdf_url is poisoned in DB, public traffic can trigger server-side requests to unintended destinations.

Attack scenario:
- Poisoned record points to internal metadata service or sensitive internal host; each public verify request drives SSRF attempts.

Evidence:

    const pdfResponse = await fetch(certificate.pdf_url, { cache: 'no-store' });

Fix (secure code):

    import { assertSafeTemplateImageUrl as assertSafeUrl } from '@/lib/utils/safe-url';

    const safePdfUrl = await assertSafeUrl(certificate.pdf_url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const pdfResponse = await fetch(safePdfUrl, {
      cache: 'no-store',
      signal: controller.signal,
      redirect: 'error',
    });
    clearTimeout(timeout);

Use a dedicated PDF-host allowlist helper instead of reusing template host logic in production.

#### 3.2 Bulk Endpoints Lack Hard Limits (Batch Size, Payload, Field Length)

Location:
- [app/api/certificates/bulk-create/route.ts](app/api/certificates/bulk-create/route.ts#L87)
- [app/api/certificates/bulk-create/route.ts](app/api/certificates/bulk-create/route.ts#L90)
- [app/api/certificates/bulk-email/route.ts](app/api/certificates/bulk-email/route.ts#L40)
- [app/api/certificates/bulk-email/route.ts](app/api/certificates/bulk-email/route.ts#L43)

Category: Security + Incomplete Implementation

Severity: High

What is happening:
- Endpoints only check non-empty arrays; no cap on number of entries/IDs, no strict schema validation, no per-field size constraints.

Why it is dangerous:
- Enables resource exhaustion and expensive DB/email workloads from oversized requests.

Attack scenario:
- Authenticated malicious actor submits tens of thousands of records in a single request and saturates DB, queue worker, and SMTP throughput.

Evidence:

    const body = (await request.json()) as BulkCreateRequest;
    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'No certificate entries provided' }, { status: 400 });
    }

Fix (secure code):

    import { z } from 'zod';

    const BulkCreateSchema = z.object({
      entries: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().email().max(254),
      }).catchall(z.string().max(500))).min(1).max(1000),
      event_name: z.string().trim().min(1).max(150),
      date_of_issue: z.string().optional(),
      template_id: z.string().uuid(),
      folder_id: z.string().uuid(),
    });

    const parsed = BulkCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

### Medium

#### 3.3 Raw Internal Error Messages Returned To Client In Server Actions

Location:
- [app/actions/certificates.ts](app/actions/certificates.ts#L158)
- [app/actions/certificates.ts](app/actions/certificates.ts#L393)
- [app/actions/templates.ts](app/actions/templates.ts#L215)
- [app/actions/pdf.ts](app/actions/pdf.ts#L185)
- [app/actions/email.ts](app/actions/email.ts#L131)

Category: Security

Severity: Medium

What is happening:
- Many actions return error.message and fetchError.message directly.

Why it is dangerous:
- Leaks internal table/policy/storage details to end users and attackers.

Attack scenario:
- Attacker uses invalid IDs/payloads to elicit DB policy and object path messages, then tunes follow-up attacks.

Evidence:

    if (error) {
        return { success: false, error: error.message };
    }

Fix (secure code):

    const incidentId = createIncidentId();
    logWithIncident('Action failed', incidentId, error);
    return { success: false, error: `Operation failed (ref: ${incidentId})` };

#### 3.4 Weak Email Validation In Sensitive Update Path

Location:
- [app/actions/certificates.ts](app/actions/certificates.ts#L137)

Category: Security + Incomplete Implementation

Severity: Medium

What is happening:
- Email update validation only checks whether the string contains @.

Why it is dangerous:
- Invalid and malformed addresses can be stored; increases delivery failure and potential header abuse vectors.

Attack scenario:
- Operator error or malicious input stores malformed addresses, causing downstream email failures and queue instability.

Evidence:

    if (!email || !email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }

Fix (secure code):

    import { z } from 'zod';

    const EmailSchema = z.string().trim().email().max(254);
    const parsedEmail = EmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      return { success: false, error: 'Invalid email address' };
    }

#### 3.5 CSP Allows Unsafe Inline Script And Style

Location:
- [next.config.ts](next.config.ts#L13)
- [next.config.ts](next.config.ts#L14)

Category: Security Misconfiguration

Severity: Medium

What is happening:
- Global CSP includes unsafe-inline for style and script.

Why it is dangerous:
- Reduces protection against XSS payload execution.

Attack scenario:
- Any future rendering bug (for example in dynamic HTML contexts) can escalate to script execution more easily under permissive CSP.

Evidence:

    "style-src 'self' 'unsafe-inline' https:",
    `script-src 'self' 'unsafe-inline'...`

Fix (secure code):

    // Prefer nonce-based strict CSP
    "style-src 'self' https:",
    `script-src 'self' 'nonce-${nonce}'${isProduction ? '' : " 'unsafe-eval'"}`,

Use nonce-only scripts in production and remove unsafe-inline.

### Low

#### 3.6 No Direct Evidence Of Hardcoded Secrets In Tracked Files, But Local Workspace Contains Live Secrets

Location:
- [.gitignore](.gitignore#L29)
- git ls-files output showed only .env.example tracked
- Local secret values were detected in .env (untracked workspace file)

Category: Secrets & Sensitive Data Exposure

Severity: Low (repository), Medium (operational if workstation shared)

What is happening:
- Repository policy correctly ignores .env.
- However, local .env currently stores live service-role and mail credentials.

Why it is dangerous:
- Secrets can leak via logs, screenshots, backups, or accidental copy/paste.

Attack scenario:
- Shared machine or support bundle exposes .env and attacker gains full service-role access.

Evidence:
- .gitignore rule:

    .env*
    !.env.example

Fix:
- Rotate currently active secrets.
- Use managed secret stores only in deployment environments.
- Add pre-commit secret scanning and local shell history hardening.


## 4. Incomplete / Risky Implementations

Explicit unfinished or weak areas:
- Authorization consistency gap: several critical server actions skip requireAdminUser while adjacent actions enforce it.
- Validation depth gap: bulk payloads and email updates rely on minimal checks.
- Error-handling consistency gap: route handlers use incident IDs, but many server actions still return raw backend errors.
- Defense-in-depth gap: public PDF fetch trusts DB URL without strict host/scheme/timeouts.

Why dangerous in production:
- These gaps create fragile security that depends on multiple external assumptions (middleware routing, RLS behavior, env correctness).

Recommended full implementations:
- Create one shared guard utility for admin-only actions and call it at the top of every sensitive action.
- Add strict request schemas with hard limits in all mutating endpoints and server actions.
- Standardize error model to incident IDs everywhere.
- Add URL-safe fetch helper for certificate PDF retrieval with allowlist, redirect policy, and timeout.

## 5. Security Misconfigurations

### 5.1 Rate Limiter Misconfiguration Is Not Fail-Closed
- See [lib/utils/rate-limit.ts](lib/utils/rate-limit.ts#L112).
- Production should fail closed when distributed limiter is unavailable.

### 5.2 CSP Is Too Permissive
- See [next.config.ts](next.config.ts#L13).
- Remove unsafe-inline in production and rely on nonces/hashes.

### 5.3 Storage Guidance Drift
- README suggests public certificates bucket at [README.md](README.md#L134).
- SQL guidance describes private bucket in [supabase/master_setup.sql](supabase/master_setup.sql#L387).
- Align docs with a single security model.

## 6. Dependency & Supply Chain Risks

Source:
- npm audit --json output captured in workspace session
- npm ls showed source chain from @types/nodemailer -> @aws-sdk/client-sesv2 -> fast-xml-parser

Findings:
- 19 moderate vulnerabilities reported, primarily AWS SDK transitive packages in dev dependency tree.
- Concrete advisory: fast-xml-parser entity expansion bypass GHSA-jp2q-39xq-3w4g.

Impact:
- Primarily build/dev-tooling path, not direct runtime path for production server traffic.
- Still requires remediation to reduce supply-chain risk and CI audit noise.

Upgrade recommendations:
- Update @types/nodemailer to version that no longer depends on vulnerable AWS SDK chain, or remove if no longer needed.
- Run npm audit fix and re-check lockfile.
- Add CI policy: block high/critical and age-based exceptions for moderate issues.

## 7. Secrets & Sensitive Data Exposure

Findings:
- No tracked hardcoded production secrets detected in repository files.
- Local workspace .env contains active secrets (service-role and mail credentials), untracked but sensitive.

Risks:
- Operational leak risk from local machine compromise or accidental sharing.

Recommendations:
- Rotate currently active secrets.
- Use short-lived, least-privilege credentials where possible.
- Add secret scanning in CI and pre-commit hooks.

## 8. Remediation Roadmap

Immediate (Critical fixes):
1. Add requireAdminUser to every sensitive server action listed in section 2.1.
2. Make rate limiter fail-closed in production when Upstash is missing.
3. Validate and restrict custom link placeholder URIs to https allowlisted domains.
4. Add allowlist + timeout + redirect controls for public PDF URL fetch.

Short-term fixes:
1. Add zod schemas and strict max limits for all bulk and mutating payloads.
2. Replace raw error.message returns with incident-based safe errors.
3. Tighten CSP (remove unsafe-inline in production).
4. Align README and Supabase setup docs on bucket privacy model.

Long-term hardening:
1. Add automated security tests for authorization boundaries and action-level guard coverage.
2. Add static checks to enforce guard presence on action exports matching mutating patterns.
3. Introduce centralized policy layer for URL validation, output sanitization, and error contract.
4. Establish dependency governance with scheduled audit and SBOM tracking.

## 9. Secure Coding Recommendations

Next.js:
- Treat every server action as externally reachable; enforce auth/role checks inside the action itself.
- Keep strict route-level input schemas for API handlers and action inputs.
- Use nonce-based CSP in production and avoid unsafe-inline.

Node.js:
- Fail closed for security controls (rate limiting, auth middleware dependencies).
- Enforce outbound fetch allowlists, redirect limits, and timeout/abort controls.
- Return stable user-safe errors and log incident IDs server-side.

TypeScript:
- Validate runtime inputs with schema libraries (zod) rather than relying on interfaces.
- Prefer narrow DTOs for public endpoints and explicit field-level constraints.
- Add lint rules or codemods to detect mutating actions missing authorization guards.

---

Audit date: 2026-03-20
Repository: TrueMark
Branch reviewed: pre-production-main
