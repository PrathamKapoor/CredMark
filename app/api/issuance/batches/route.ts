import { NextRequest } from 'next/server';
import { authorize,endpoint,readJson } from '@/lib/issuance/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { BatchSubmissionSchema } from '@/lib/issuance/validation';
import { submitBatch } from '@/lib/issuance/service';
export async function GET(request:NextRequest){return endpoint(async()=>{
  await authorize(request,'batches:read');
  const {data,error}=await createAdminClient().from('issuance_batches').select('id,event_id,template_id,status,send_email,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;return {batches:data};
});}
export async function POST(request:NextRequest){return endpoint(async()=>{
  const actor=await authorize(request,'batches:write',true);
  const raw=await readJson(request);
  const body=raw&&typeof raw==='object'?{...raw}:raw;
  const headerKey=request.headers.get('idempotency-key');
  if(headerKey&&body&&typeof body==='object')Object.assign(body,{idempotency_key:headerKey});
  const input=BatchSubmissionSchema.parse(body);
  return {batchId:await submitBatch(input,actor.id),status:'draft'};
},201);}
