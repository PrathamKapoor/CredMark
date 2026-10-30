import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isAdminUser} from '@/lib/auth/roles';
import {isTrustedOrigin} from '@/lib/utils/origin-validation';
import {generateManualPdf} from '@/lib/issuance/service';
import {generatePdfBytes} from '@/app/actions/pdf';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!isAdminUser(user))return NextResponse.json({error:'Forbidden'},{status:403});
 const result=await generatePdfBytes((await params).id);
 if(!result.success||!result.pdfBytes)return NextResponse.json({error:result.error},{status:400});
 return new NextResponse(Buffer.from(result.pdfBytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${result.fileName}"`,'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!isAdminUser(user)||!isTrustedOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403});
  const body=request.headers.get('content-type')?.includes('application/json')?await request.json():{};
  const result=await generateManualPdf((await params).id,body.regenerate===true);
  return NextResponse.json({success:true,...result,message:'PDF ready using frozen template settings'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'PDF generation failed'},{status:400});}
}
