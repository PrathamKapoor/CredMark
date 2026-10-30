import { describe, it, expect } from 'vitest';
import { payloadDigest, summarizeBatch, reportCsv } from '@/lib/issuance/domain';
import { legacyObjectPath } from '@/lib/storage/paths';

describe('issuance identity and reporting', () => {
  it('hashes equivalent object key orders identically, but rejects changed payload identities', () => {
    expect(payloadDigest({a:1,b:2})).toBe(payloadDigest({b:2,a:1}));
    expect(payloadDigest({a:2})).not.toBe(payloadDigest({a:1}));
  });
  it('derives metrics from actual stages and attempts without overstating delivery', () => {
    const summary = summarizeBatch([
      {id:'1',stage:'done',state:'completed',certificate_id:'c1'},
      {id:'2',stage:'email',state:'review_required',certificate_id:'c2'},
      {id:'3',stage:'pdf',state:'retry',certificate_id:'c3'},
    ], [{item_id:'1',outcome:'accepted_by_provider'},{item_id:'2',outcome:'ambiguous'}]);
    expect(summary).toMatchObject({total:3,certificates:3,pdfs:2,accepted:1,delivered:0,ambiguous:1,pending:1});
  });
  it('escapes CSV quotes, newlines and spreadsheet formulas', () => {
    const csv = reportCsv([{id:'a',input:{name:'=HYPERLINK("bad")',email:'a@example.com'},stage:'pdf',state:'failed',last_error:'two\nlines'}], []);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"two\nlines"');
  });
  it('parses only own-project legacy URLs and excludes signed query strings', () => {
    expect(legacyObjectPath('https://project.supabase.co/storage/v1/object/sign/certificates/event/code.pdf?token=secret','https://project.supabase.co')).toBe('event/code.pdf');
    expect(legacyObjectPath('https://evil.example/storage/v1/object/public/certificates/code.pdf','https://project.supabase.co')).toBeNull();
    expect(legacyObjectPath('https://project.supabase.co/storage/v1/object/public/templates/code.pdf','https://project.supabase.co')).toBeNull();
  });
});
