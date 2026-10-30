import { describe, expect, it } from 'vitest';
import { classifySmtpError, createEmailProvider, makeCertificateMessage } from '@/lib/email/provider';
import { calculateCooldown } from '@/lib/utils/email-utils';

describe('safe email outcomes', () => {
  it('does not treat a timeout after DATA as a retryable rejection', () => {
    expect(classifySmtpError({ code: 'ETIMEDOUT', command: 'DATA' }).outcome).toBe('ambiguous');
  });
  it('permits retries only after a definitive temporary rejection or pre-send failure', () => {
    expect(classifySmtpError({ responseCode: 451 }).outcome).toBe('retryable');
    expect(classifySmtpError({ code: 'ECONNREFUSED', command: 'CONN' }).outcome).toBe('retryable');
    expect(classifySmtpError({ responseCode: 550 }).outcome).toBe('permanent');
    expect(classifySmtpError(new Error('unknown transport failure')).outcome).toBe('ambiguous');
  });
  it('uses stable controlled links and escapes recipient markup', () => {
    const message = makeCertificateMessage({name:'<Asha>',email:'asha@example.com',event_name:'Workshop',certificate_code:'ABCDEF123456'}, 'https://cert.example.org');
    expect(message.html).toContain('&lt;Asha&gt;');
    expect(message.html).toContain('https://cert.example.org/api/verify/ABCDEF123456/pdf');
    expect(message.text).toContain('https://cert.example.org/verify/ABCDEF123456');
    expect(message.html).not.toContain('token=');
  });
  it('captures without constructing an SMTP transport in tests', async () => {
    const provider = createEmailProvider();
    const result = await provider.send({to:'asha@example.com',subject:'Certificate',html:'<p>test</p>',text:'test',messageId:'<test@truemark.local>'});
    expect(result.outcome).toBe('accepted_by_provider');
    expect(result.providerId).toBe('<test@truemark.local>');
  });
  it('paces batches in seconds rather than one millisecond', () => {
    expect(calculateCooldown(100)).toBeGreaterThanOrEqual(1000);
  });
});
