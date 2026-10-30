import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authorize,endpoint,readJson,HttpError } from '@/lib/issuance/http';
import { batchDetail } from '@/lib/issuance/service';
import { createAdminClient } from '@/lib/supabase/admin';
import { QueueRepository } from '@/lib/issuance/repository';
const command=z.discriminatedUnion('action',[
  z.object({action:z.enum(['approve','pause','resume','retry'])}).strict(),
  z.object({action:z.literal('reconcile'),attempt_id:z.string().uuid(),outcome:z.enum(['accepted_by_provider','failed']),note:z.string().trim().min(10).max(2000)}).strict(),
]);
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){return endpoint(async()=>{
  await authorize(request,'batches:read');return batchDetail(z.string().uuid().parse((await context.params).id));
});}
export async function POST(request:NextRequest,context:Context){return endpoint(async()=>{
  const body=command.parse(await readJson(request,8192));
  const actor=await authorize(request,body.action==='approve'?'batches:approve':'batches:write',true);
  if(body.action==='reconcile'&&actor.machine)throw new HttpError(403,'Operator reconciliation requires an administrator session');
  const id=z.string().uuid().parse((await context.params).id),detail=await batchDetail(id),repo=new QueueRepository(createAdminClient());
  if(body.action==='reconcile'){
    const attempt=(detail.attempts as Array<{id?:string}>).find(a=>a.id===body.attempt_id);
    if(!attempt)throw new HttpError(404,'Attempt not found in this batch');
    await repo.rpc('reconcile_email_attempt',{p_attempt_id:body.attempt_id,p_outcome:body.outcome,p_note:`Operator ${actor.id}: ${body.note}`});
  }else if(body.action==='approve')await repo.rpc('approve_issuance_batch',{p_batch_id:id});
  else await repo.rpc('control_issuance_batch',{p_batch_id:id,p_action:body.action});
  return {success:true};
});}
