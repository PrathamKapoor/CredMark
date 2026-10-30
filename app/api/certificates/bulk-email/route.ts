import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isAdminUser} from '@/lib/auth/roles';
import {isTrustedOrigin} from '@/lib/utils/origin-validation';
import {enqueueManualEmails} from '@/lib/issuance/service';
import {BulkEmailRequestSchema} from '@/lib/validation/bulk-operations';
export async function POST(request:NextRequest) {
 try {
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!isAdminUser(user)||!isTrustedOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403});
  const parsed=BulkEmailRequestSchema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:'Invalid request',details:parsed.error.issues},{status:400});
  const batchId=await enqueueManualEmails(parsed.data.certificateIds,user.id,request.headers.get('Idempotency-Key')||randomUUID(),!parsed.data.skipAlreadySent);
  return NextResponse.json({success:true,queued:true,batchId,message:'Emails queued'},{status:202,headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Email enqueue failed'},{status:400});}
}
