import { beforeEach, vi } from 'vitest';

// Tests cannot inherit an operator's SMTP credentials or contact external services.
process.env.EMAIL_PROVIDER = 'capture';
Object.assign(process.env, { NODE_ENV: 'test' });
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'test-only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network access is prohibited in tests'); }));
});
