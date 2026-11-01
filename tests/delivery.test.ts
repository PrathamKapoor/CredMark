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
  it('chooses wording from the certificate type', () => {
    const recipient = {name:'Asha',email:'asha@example.com',event_name:'Hackathon',certificate_code:'ABCDEF123456'};
    const wording = (certificate_type?:string) => makeCertificateMessage({...recipient,certificate_type}, 'https://cert.example.org');
    for (const type of ['Winner','winners','1st Place Winner']) {
      expect(wording(type).subject).toBe('Congratulations! Your Hackathon winner certificate');
      expect(wording(type).text).toContain('Congratulations on being a winner at Hackathon!');
    }
    for (const type of ['Participant','Participation']) {
      expect(wording(type).subject).toBe('Thank you for participating in Hackathon – Certificate');
      expect(wording(type).html).toContain('Thank you for participating in Hackathon.');
    }
    for (const type of [undefined,'Runner-up','Winnerless']) {
      expect(wording(type).subject).toBe('Hackathon – Certificate');
      expect(wording(type).text).toContain('Your certificate for Hackathon is ready.');
    }
  });
  it('escapes event names and keeps subjects on one line in every wording', () => {
    for (const certificate_type of ['Winner','Participation','Other']) {
      const message = makeCertificateMessage({name:'Asha',email:'asha@example.com',event_name:'<b>Expo</b>\r\nBcc: x@example.com',certificate_code:'ABCDEF123456',certificate_type}, 'https://cert.example.org');
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.html).toContain('&lt;b&gt;Expo&lt;/b&gt;');
      expect(message.html).not.toContain('<b>Expo</b>');
    }
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
