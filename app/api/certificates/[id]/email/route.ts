import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isAdminUser} from '@/lib/auth/roles';
import {isTrustedOrigin} from '@/lib/utils/origin-validation';
import {enqueueManualEmails} from '@/lib/issuance/service';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!isAdminUser(user) || !isTrustedOrigin(request)) return NextResponse.json({error:'Forbidden'},{status:403});
  const body=request.headers.get('content-type')?.includes('application/json')?await request.json():{};
  if(body.resend!==undefined && typeof body.resend!=='boolean') return NextResponse.json({error:'Invalid resend option'},{status:400});
  const batchId=await enqueueManualEmails([(await params).id],user.id,request.headers.get('Idempotency-Key') || randomUUID(),body.resend===true);
  return NextResponse.json({success:true,queued:true,batchId,message:'Email queued'},{status:202,headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Email enqueue failed'},{status:400});}
}
