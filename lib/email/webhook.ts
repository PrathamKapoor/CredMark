import { createHmac,timingSafeEqual } from 'node:crypto';
export function verifyDeliverySignature(raw:string,timestamp:string|null,signature:string|null,secret:string,now=Date.now()):boolean {
  if(!timestamp||!signature||!/^\d{10}$/.test(timestamp)||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  if(Math.abs(now-Number(timestamp)*1000)>5*60*1000)return false;
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest();
  const actual=Buffer.from(signature.slice(7),'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
