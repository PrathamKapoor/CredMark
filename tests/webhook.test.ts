import { it,expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyDeliverySignature } from '@/lib/email/webhook';
it('accepts an authenticated recent delivery event but rejects tampering and stale replay',()=>{
  const raw='{"event_id":"a"}',timestamp='1700000000',secret='test-only-signing-secret';
  const signature=`sha256=${createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex')}`;
  expect(verifyDeliverySignature(raw,timestamp,signature,secret,1700000000000)).toBe(true);
  expect(verifyDeliverySignature(raw+' ',timestamp,signature,secret,1700000000000)).toBe(false);
  expect(verifyDeliverySignature(raw,timestamp,signature,secret,1700000400000)).toBe(false);
});
