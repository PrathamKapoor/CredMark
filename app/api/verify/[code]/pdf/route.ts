import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPublicPdfRateLimit } from '@/lib/utils/rate-limit';
import { certificateObjectPath, normalizePublicCode, PRIVATE_PDF_HEADERS } from '@/lib/verification/public';
export async function GET(request: NextRequest, {params}: {params: Promise<{code:string}>}) {
 const failure=(error:string,status:number)=>NextResponse.json({error},{status,headers:PRIVATE_PDF_HEADERS});
 try {
  const limit=await checkPublicPdfRateLimit(request.headers);
  if(!limit.allowed) return NextResponse.json({error:limit.message || 'Too many requests'},{status:429,headers:{...PRIVATE_PDF_HEADERS,'Retry-After':String(limit.retryAfter ?? 60)}});
  const code=normalizePublicCode((await params).code);
  if(!code) return failure('Certificate not found',404);
  const admin=createAdminClient();
  const {data:certificate,error}=await admin.from('certificates').select('certificate_code,is_valid,pdf_object_path,pdf_url').eq('certificate_code',code).single();
  if(error || !certificate || !certificate.is_valid) return failure('Certificate not found or revoked',404);
  const path=certificateObjectPath(certificate,process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  if(!path) return failure('Certificate PDF is not available yet',404);
  const {data:pdf,error:downloadError}=await admin.storage.from('certificates').download(path);
  if(downloadError || !pdf) return failure('Stored certificate PDF could not be retrieved',404);
  const bytes=await pdf.arrayBuffer();
  return new NextResponse(Buffer.from(bytes),{headers:{...PRIVATE_PDF_HEADERS,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${code}.pdf"`,'Content-Length':String(bytes.byteLength)}});
 } catch { return failure('Certificate PDF could not be retrieved',500); }
}
