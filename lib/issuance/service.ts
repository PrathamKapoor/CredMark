import { createAdminClient } from '@/lib/supabase/admin';
import { freezeRendering,ensurePdfArtifact,isSnapshot,sha256 } from './artifacts';
import { certificateObjectPath } from '@/lib/verification/public';
import { stableDownloadUrl } from '@/lib/storage/paths';
import { payloadDigest,summarizeBatch,IssuanceConflict,type Item,type Attempt } from './domain';
import { QueueRepository } from './repository';
import { BatchSubmissionSchema } from './validation';
import type { Certificate,Template } from '@/lib/types/database';
import type { z } from 'zod';

export async function submitBatch(input:z.input<typeof BatchSubmissionSchema>,creator:string,approved=false) {
  const parsed=BatchSubmissionSchema.parse(input),db=createAdminClient();
  const key=`${creator}:${parsed.idempotency_key}`,hash=payloadDigest(parsed);
  const {data:existing,error:existingError}=await db.from('issuance_batches').select('id,payload_hash').eq('idempotency_key',key).maybeSingle();
  if(existingError)throw new Error('Cannot inspect existing batch');
  if(existing){if(existing.payload_hash!==hash)throw new Error('Idempotency conflict');return existing.id as string;}
  const [templateResult,eventResult,folderResult]=await Promise.all([
    db.from('templates').select('*').eq('id',parsed.template_id).single(),
    db.from('events').select('*').eq('id',parsed.event_id).single(),
    db.from('folders').select('id').eq('id',parsed.folder_id).single(),
  ]);
  if(templateResult.error||eventResult.error||folderResult.error)throw new Error('Selected event, template, or folder not found');
  const previous=new Map<string,Certificate>();
  const identities=parsed.recipients.map(recipient=>`${parsed.event_id}:${recipient.recipient_key??recipient.email}:${eventResult.data.certificate_type}`);
  for(let index=0;index<identities.length;index+=100){
    const {data,error}=await db.from('certificates').select('*').in('issuance_identity',identities.slice(index,index+100));
    if(error)throw new Error('Cannot inspect existing issuance identities');
    for(const certificate of data as Certificate[])previous.set(certificate.issuance_identity!,certificate);
  }
  parsed.recipients.forEach((recipient,index)=>{
    const old=previous.get(identities[index]);
    if(old&&(old.name!==recipient.name||old.email.toLowerCase()!==recipient.email||old.template_id!==parsed.template_id||payloadDigest(old.custom_fields??{})!==payloadDigest(recipient.custom_fields)))throw new IssuanceConflict(`Row ${index+1} conflicts with an existing certificate identity. Review recipient values or use a distinct event/certificate type.`);
  });
  const snapshot=await freezeRendering(db,templateResult.data as Template,process.env.NEXT_PUBLIC_BASE_URL!);
  snapshot.event=eventResult.data;
  const recipients=parsed.recipients.map((recipient,index)=>({...recipient,recipient_key:recipient.recipient_key??recipient.email,folder_id:parsed.folder_id,...(previous.get(identities[index])?{existing_certificate_id:previous.get(identities[index])!.id}:{})}));
  return new QueueRepository(db).rpc<string>('submit_issuance_batch',{p_event_id:parsed.event_id,p_template_id:parsed.template_id,p_creator:creator,p_key:key,p_hash:hash,p_recipients:recipients,p_snapshot:snapshot,p_send_email:parsed.send_email,p_approved:approved});
}
export async function batchDetail(id:string) {
  const db=createAdminClient();
  const [batch,items]=await Promise.all([
    db.from('issuance_batches').select('*').eq('id',id).single(),
    db.from('issuance_items').select('*').eq('batch_id',id).order('created_at',{ascending:true}).limit(10000),
  ]);
  if(batch.error||items.error||!batch.data) throw new Error('Batch not found');
  const certificates=new Map<string,{id:string;name:string;email:string;pdf_object_path:string|null;pdf_url:string|null}>();
  const certificateIds=[...new Set((items.data as Item[]).map(item=>item.certificate_id).filter((id):id is string=>!!id))];
  for(let index=0;index<certificateIds.length;index+=100){
    const result=await db.from('certificates').select('id,name,email,pdf_object_path,pdf_url').in('id',certificateIds.slice(index,index+100));
    if(result.error)throw new Error('Cannot read artifact progress');
    for(const certificate of result.data)certificates.set(certificate.id,certificate);
  }
  for(const item of items.data as Item[]){
    const certificate=certificates.get(item.certificate_id??'');
    item.pdf_ready=!!(certificate?.pdf_object_path||certificate?.pdf_url);
    item.input={name:certificate?.name,email:certificate?.email,...item.input};
  }
  const ids=items.data.map((item:Item)=>item.id);
  // Chunking avoids URL-length and PostgREST row limits on batches with hundreds of recipients.
  const attempts:Attempt[]=[];
  for(let index=0;index<ids.length;index+=100){
    const page=await db.from('email_attempts').select('*').in('item_id',ids.slice(index,index+100)).order('created_at',{ascending:true}).limit(10000);
    if(page.error)throw new Error('Cannot read email attempts');attempts.push(...page.data as Attempt[]);
  }
  return {batch:batch.data,items:items.data as Item[],attempts,summary:summarizeBatch(items.data,attempts)};
}
export async function generateManualPdf(certificateId:string,regenerate=false):Promise<{pdfUrl:string}> {
  const db=createAdminClient();
  const cert=await new QueueRepository(db).certificate(certificateId);
  if(!cert.is_valid)throw new Error('Certificate revoked');
  let snapshot=cert.render_snapshot;
  const legacyPath=certificateObjectPath(cert,process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(!isSnapshot(snapshot)&&legacyPath&&!regenerate){
    const {data:oldPdf,error:downloadError}=await db.storage.from('certificates').download(legacyPath);
    if(downloadError||!oldPdf)throw new Error('Historical PDF unavailable. Explicit regeneration is required to capture current template settings.');
    const checksum=sha256(new Uint8Array(await oldPdf.arrayBuffer()));
    const url=stableDownloadUrl(cert.certificate_code);
    const {data,error}=await db.from('certificates').update({pdf_object_path:legacyPath,pdf_sha256:checksum,pdf_url:url}).eq('id',certificateId).eq('is_valid',true).select('id').maybeSingle();
    if(error||!data)throw new Error('Cannot adopt historical PDF; certificate may have been revoked');
    return {pdfUrl:url};
  }
  if(!isSnapshot(snapshot)){
    if(!cert.template_id)throw new Error('No template assigned');
    const {data,error}=await db.from('templates').select('*').eq('id',cert.template_id).single();
    if(error||!data)throw new Error('Template not found');
    snapshot=await freezeRendering(db,data as Template,process.env.NEXT_PUBLIC_BASE_URL!);
    // First successful capture wins; do not let concurrent manual requests change historical inputs.
    const {error:updateError}=await db.from('certificates').update({render_snapshot:snapshot}).eq('id',certificateId).is('render_snapshot',null);
    if(updateError)throw new Error('Cannot freeze certificate rendering');
    const frozen=await new QueueRepository(db).certificate(certificateId);
    snapshot=frozen.render_snapshot;
  }
  if(!isSnapshot(snapshot))throw new Error('Invalid rendering snapshot');
  const artifact=await ensurePdfArtifact(db,cert as Certificate,snapshot,regenerate);
  const {data:updated,error}=await db.from('certificates').update({pdf_object_path:artifact.object_path,pdf_sha256:artifact.sha256,pdf_url:artifact.pdf_url}).eq('id',certificateId).eq('is_valid',true).select('id').maybeSingle();
  if(error||!updated)throw new Error('Cannot persist PDF result; certificate may have been revoked');
  return {pdfUrl:artifact.pdf_url};
}
export async function enqueueManualEmails(ids:string[],creator:string,key:string,resend=false):Promise<string> {
  if(!ids.length||ids.length>1000)throw new Error('Select between 1 and 1000 certificates');
  return new QueueRepository(createAdminClient()).rpc<string>('enqueue_existing_email',{p_certificate_ids:[...new Set(ids)].sort(),p_creator:creator,p_key:`manual:${creator}:${key}`,p_resend:resend});
}
