'use server';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {requireAdminOrThrow} from '@/lib/auth/admin';
import {enqueueManualEmails} from '@/lib/issuance/service';
export interface BulkEmailResult {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    results: Array<{
        certificateId: string;
        certificateCode: string;
        name: string;
        email: string;
        success: boolean;
        skipped?: boolean;
        error?: string;
    }>;
}


export async function getCertificatesReadyForEmail() {
 try {await requireAdminOrThrow();const db=await createClient();const {data,error}=await db.from('certificates').select('id,certificate_code,name,email,event_name,pdf_url,pdf_object_path').eq('is_valid',true).eq('email_sent',false).or('pdf_object_path.not.is.null,pdf_url.not.is.null');if(error) throw error;return {success:true,certificates:data || []};}
 catch(error){return {success:false,error:error instanceof Error?error.message:'Failed to fetch certificates'};}
}
export async function sendSingleCertificateEmail(certificateId:string):Promise<{success:boolean;queued?:boolean;batchId?:string;error?:string}> {
 try {const user=await requireAdminOrThrow();const batchId=await enqueueManualEmails([certificateId],user.id,randomUUID());return {success:true,queued:true,batchId};}
 catch(error){return {success:false,error:error instanceof Error?error.message:'Email enqueue failed'};}
}
export async function sendBulkEmails(certificateIds:string[],skipAlreadySent=true):Promise<{success:boolean;queued?:boolean;batchId?:string;result?:BulkEmailResult;error?:string}> {
 try {const user=await requireAdminOrThrow();const batchId=await enqueueManualEmails(certificateIds,user.id,randomUUID(),!skipAlreadySent);return {success:true,queued:true,batchId};}
 catch(error){return {success:false,error:error instanceof Error?error.message:'Email enqueue failed'};}
}
