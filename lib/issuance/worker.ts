import { randomUUID } from 'node:crypto';
import type { EmailProvider } from '@/lib/email/provider';
import { makeCertificateMessage } from '@/lib/email/provider';
import { ensurePdfArtifact,isSnapshot } from './artifacts';
import { QueueRepository,type Claim } from './repository';

export interface WorkerOptions {provider:EmailProvider;leaseSeconds:number;cooldownMs?:number}
export async function processClaim(repo:QueueRepository,item:Claim,options:WorkerOptions):Promise<void> {
  let lostLease=false;
  const heartbeat=setInterval(()=>{
    repo.heartbeat(item,options.leaseSeconds).catch(()=>{lostLease=true;});
  },Math.max(1000,options.leaseSeconds*1000/3));
  heartbeat.unref?.();
  try {
    await repo.heartbeat(item,options.leaseSeconds);
    if(item.stage==='issue') {await repo.complete(item);return;}
    const certificate=await repo.certificate(item.certificate_id!);
    if(!certificate.is_valid) {await repo.fail(item,'Certificate revoked','revoked');return;}
    const batch=await repo.batch(item.batch_id);
    if(batch.status==='paused') {await repo.rpc('defer_issuance_item',{...repo.fence(item),p_seconds:5});return;}
    if(item.stage==='pdf') {
      const snapshot=isSnapshot(certificate.render_snapshot)?certificate.render_snapshot:batch.render_snapshot;
      if(!isSnapshot(snapshot)) {await repo.fail(item,'Rendering snapshot is missing','permanent');return;}
      const artifact=await ensurePdfArtifact(repo.db,certificate,snapshot);
      if(lostLease) throw new Error('Stale or expired lease');
      await repo.complete(item,artifact);return;
    }
    if(!certificate.pdf_object_path&&!certificate.pdf_url) {await repo.fail(item,'PDF must be generated first','permanent');return;}
    if(certificate.email_sent&&!item.input.explicit_resend){await repo.rpc('skip_issuance_item',{...repo.fence(item),p_reason:'Already accepted by provider'});return;}
    if(options.provider.name==='disabled'){await repo.rpc('defer_issuance_item',{...repo.fence(item),p_seconds:60});return;}
    const snapshot=isSnapshot(certificate.render_snapshot)?certificate.render_snapshot:null;
    const baseUrl=snapshot?.baseUrl??process.env.NEXT_PUBLIC_BASE_URL;
    if(!baseUrl) throw new Error('Application URL is missing');
    const message=makeCertificateMessage({...certificate,certificate_type:snapshot?.event?.certificate_type},baseUrl);
    if(lostLease) throw new Error('Stale or expired lease');
    // Both the lease and current validity are checked again atomically by begin_email_attempt.
    await repo.heartbeat(item,options.leaseSeconds);
    const attemptId=await repo.rpc<string|null>('begin_email_attempt',{...repo.fence(item),p_provider:options.provider.name,p_message_id:`<${item.id}.${item.fencing_token}@truemark.local>`,p_cooldown_ms:options.cooldownMs??3000,p_envelope:{name:certificate.name,email:certificate.email,event_name:certificate.event_name,certificate_code:certificate.certificate_code,message}});
    if(!attemptId){await repo.rpc('defer_issuance_item',{...repo.fence(item),p_seconds:Math.max(1,Math.ceil((options.cooldownMs??3000)/1000))});return;}
    if(lostLease) throw new Error('Stale or expired lease');
    const result=await options.provider.send({...message,messageId:`<${item.id}.${item.fencing_token}@truemark.local>`});
    await repo.rpc('finish_email_attempt',{...repo.fence(item),p_attempt_id:attemptId,p_outcome:result.outcome==='accepted_by_provider'?'accepted_by_provider':result.outcome==='ambiguous'?'ambiguous':'failed',p_provider_id:result.providerId??null,p_error:result.error??null});
    if(result.outcome==='accepted_by_provider') await repo.complete(item);
    else if(result.outcome!=='ambiguous') await repo.fail(item,result.error??'Provider rejected the message',result.outcome==='permanent'?'permanent':'transient');
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('batch paused')){
      try{await repo.rpc('defer_issuance_item',{...repo.fence(item),p_seconds:5});}catch{/* Recovery owns an expired claim. */}
      return;
    }
    if(message==='Already accepted'){
      try{await repo.rpc('skip_issuance_item',{...repo.fence(item),p_reason:'Already accepted by provider'});}catch{/* Lease recovery is authoritative. */}
      return;
    }
    const classification=/revoked/i.test(message)?'revoked':/suppressed|snapshot|font file|Invalid|not found|identity conflict|Recipient changed/i.test(message)?'permanent':'transient';
    // Persist only a bounded diagnostic; full transport errors can contain recipient addresses.
    const safeError=/Stale|expired lease/.test(message)?'Claim ownership lost':/suppressed/.test(message)?'Recipient suppressed':/revoked/.test(message)?'Certificate revoked':/identity conflict/.test(message)?'Issuance identity conflicts with an existing certificate':/Recipient changed/.test(message)?'Recipient changed after preparation; review the address':`Processing failed during ${item.stage}; inspect worker incident`;
    try{await repo.fail(item,safeError,classification);}catch{/* A new owner or recovery RPC now owns the decision. */}
    console.error(JSON.stringify({event:'issuance_processing_error',incidentId:randomUUID(),itemId:item.id,stage:item.stage,classification}));
  }finally{clearInterval(heartbeat);}
}
export async function runWorker(repo:QueueRepository,options:WorkerOptions&{concurrency:number;signal:AbortSignal;once?:boolean;workerId?:string}):Promise<void> {
  const concurrency=options.concurrency;
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16) throw new Error('Worker concurrency must be between 1 and 16');
  const worker=options.workerId??randomUUID();
  const halt=new AbortController();
  const stop=()=>halt.abort();
  options.signal.addEventListener('abort',stop,{once:true});
  if(options.signal.aborted)stop();
  const results=await Promise.allSettled(Array.from({length:concurrency},async(_,slot)=>{
   try {
    while(!halt.signal.aborted){
      const claim=await repo.claim(`${worker}:${slot}`,options.leaseSeconds);
      if(claim) await processClaim(repo,claim,options);
      else if(options.once) return;
      else await new Promise<void>(resolve=>{
        const abort=()=>{clearTimeout(timer);resolve();};
        const timer=setTimeout(()=>{halt.signal.removeEventListener('abort',abort);resolve();},1000);
        halt.signal.addEventListener('abort',abort,{once:true});
        if(halt.signal.aborted)abort();
      });
    }
   }catch(error){halt.abort();throw error;}
  }));
  options.signal.removeEventListener('abort',stop);
  const failure=results.find(result=>result.status==='rejected');
  if(failure?.status==='rejected')throw failure.reason;
}
