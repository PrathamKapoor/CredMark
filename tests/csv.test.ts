import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/issuance/csv';
describe('CSV imports', () => {
  it('handles BOM, escaped quotes, commas and multiline fields', () => {
    expect(parseCsv('\uFEFFname,email,note\r\n"Doe, Jane",j@example.org,"A ""quoted""\nline"\r\n')).toEqual([['name','email','note'],['Doe, Jane','j@example.org','A "quoted"\nline']]);
  });
  it('preserves apostrophes and rejects malformed quotes', () => {
    expect(parseCsv("name\nO'Brien")[1][0]).toBe("O'Brien");
    expect(() => parseCsv('name\n"unfinished')).toThrow();
    expect(() => parseCsv('name\n"closed"oops')).toThrow();
  });
  it('rejects duplicate headers, ragged records, oversized files and too many rows', () => {
    expect(()=>parseCsv('Name,name\nA,B')).toThrow('unique');
    expect(()=>parseCsv('name,email\nA')).toThrow('same number');
    expect(()=>parseCsv('x'.repeat(2*1024*1024+1))).toThrow('2 MB');
    expect(()=>parseCsv('name\n'+'A\n'.repeat(1001))).toThrow('1,000');
  });
});
