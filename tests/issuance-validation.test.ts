import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CirculationClient from '../app/admin/circulation/CirculationClient';
import { BatchSubmissionSchema, EventSubmissionSchema, RecipientSchema, validateRecipients } from '../lib/issuance/validation';
describe('issuance validation', () => {
  it('normalizes email identity without merging names', () => {
    expect(RecipientSchema.parse({name:' Jane ',email:' JANE@EXAMPLE.ORG '}).email).toBe('jane@example.org');
    expect(validateRecipients([{name:'Jane',email:'a@example.org'},{name:'Other',email:' A@example.org '}])).toHaveLength(1);
  });
  it('rejects impossible dates, oversized values and duplicate keys', () => {
    expect(EventSubmissionSchema.safeParse({name:'Test',date_of_issue:'2026-02-30',certificate_type:'Participation'}).success).toBe(false);
    expect(RecipientSchema.safeParse({name:'a'.repeat(121),email:'a@example.org'}).success).toBe(false);
    expect(validateRecipients([{name:'A',email:'a@example.org',recipient_key:'same'},{name:'B',email:'b@example.org',recipient_key:'same'}])).toHaveLength(1);
  });
  it('allows leap dates and rejects duplicate identities in the actual batch payload', () => {
    expect(EventSubmissionSchema.safeParse({name:'Event',date_of_issue:'2024-02-29',certificate_type:'Participation'}).success).toBe(true);
    const uuid='123e4567-e89b-42d3-a456-426614174000';
    const payload={event_id:uuid,folder_id:uuid,template_id:uuid,idempotency_key:uuid,send_email:false,recipients:[{name:'A',email:'a@example.org'}]};
    expect(BatchSubmissionSchema.safeParse(payload).success).toBe(true);
    expect(BatchSubmissionSchema.safeParse({...payload,recipients:[...payload.recipients,{name:'B',email:' A@example.org '}]}).success).toBe(false);
    expect(BatchSubmissionSchema.safeParse({...payload,event_id:'untrusted'}).success).toBe(false);
    expect(RecipientSchema.safeParse({name:'A',email:'a@example.org',custom_fields:{course:'x'.repeat(501)}}).success).toBe(false);
  });
  it('renders configuration before approval without issuing a network request', () => {
    const fetch = vi.spyOn(globalThis,'fetch');
    try {
      const html = renderToStaticMarkup(createElement(CirculationClient,{templates:[],folders:[]}));
      expect(html).toContain('Configure a draft');
      expect(html).toContain('Generate PDFs only');
      expect(html).not.toContain('Issue &amp; Distribute');
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
