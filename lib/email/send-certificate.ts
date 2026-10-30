'use server';

import { randomUUID } from 'node:crypto';
import { requireAdminOrThrow } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { enqueueManualEmails } from '@/lib/issuance/service';

interface Params {recipientEmail:string;recipientName:string;eventName:string;certificateCode:string;pdfUrl:string}
/** Compatibility adapter: delivery is owned exclusively by the durable worker. */
export async function sendCertificateEmail(params:Params):Promise<{success:boolean;queued?:boolean;batchId?:string;error?:string}> {
  const admin=await requireAdminOrThrow();
  const {data,error}=await createAdminClient().from('certificates').select('id').eq('certificate_code',params.certificateCode).single();
  if(error||!data)return {success:false,error:'Certificate not found'};
  return {success:true,queued:true,batchId:await enqueueManualEmails([data.id],admin.id,randomUUID())};
}
export async function sendCertificateEmailWithRetry(params:Params,_options?:{maxAttempts?:number;onRetry?:(context:{nextAttempt:number;delayMs:number;error:string})=>void}) {
  void _options;
  return {...await sendCertificateEmail(params),attempts:0};
}
