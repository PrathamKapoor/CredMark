import { describe, it, expect } from 'vitest';
import { certificateObjectPath, normalizePublicCode } from '../lib/verification/public';
describe('public verification boundary', () => {
 it('preserves legacy eight-character certificate links',()=>{expect(normalizePublicCode('ldnyew7k')).toBe('LDNYEW7K');});
 it('accepts exact codes and rejects enumeration inputs',()=>{expect(normalizePublicCode('abcdefgh2345')).toBe('ABCDEFGH2345'); expect(normalizePublicCode('%')).toBeNull();});
 it('accepts only own-project legacy objects',()=>{expect(certificateObjectPath({pdf_url:'https://own.supabase.co/storage/v1/object/sign/certificates/a/b.pdf?token=x'},'https://own.supabase.co')).toBe('a/b.pdf'); expect(certificateObjectPath({pdf_url:'https://evil.test/storage/v1/object/public/certificates/a.pdf'},'https://own.supabase.co')).toBeNull(); expect(certificateObjectPath({pdf_object_path:'../secrets'},'https://own.supabase.co')).toBeNull();});
});
