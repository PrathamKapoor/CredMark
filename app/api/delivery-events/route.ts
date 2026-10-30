import { NextRequest } from 'next/server';
import { z } from 'zod';
import { HttpError,endpoint } from '@/lib/issuance/http';
import { verifyDeliverySignature } from '@/lib/email/webhook';
import { QueueRepository } from '@/lib/issuance/repository';
import { createAdminClient } from '@/lib/supabase/admin';
const payload=z.object({event_id:z.string().min(1).max(200),provider_id:z.string().min(1).max(500),status:z.enum(['delivered','bounced'])}).strict();
export async function POST(request:NextRequest){return endpoint(async()=>{
  const provider=process.env.EMAIL_WEBHOOK_PROVIDER,secret=process.env.EMAIL_WEBHOOK_SECRET;
  if(!provider||!secret)throw new HttpError(501,'No delivery-event provider is configured');
  // Gmail SMTP supplies no native delivery webhook. A configured gateway must verify evidence.
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Request body required');
  const parts:Uint8Array[]=[];let length=0;
  while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>16384){await reader.cancel();throw new HttpError(413,'Delivery event is too large');}parts.push(next.value);}
  const raw=Buffer.concat(parts).toString('utf8');
  if(!verifyDeliverySignature(raw,request.headers.get('x-truemark-timestamp'),request.headers.get('x-truemark-signature'),secret))throw new HttpError(401,'Invalid delivery-event signature');
  let body:unknown;try{body=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON');}
  const event=payload.parse(body);
  await new QueueRepository(createAdminClient()).rpc('record_delivery_event',{p_event_id:event.event_id,p_provider:provider,p_provider_id:event.provider_id,p_status:event.status});
  return {success:true};
});}
