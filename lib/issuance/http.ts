import { NextRequest,NextResponse } from 'next/server';
import { randomUUID,createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/auth/admin';
import { isTrustedOrigin } from '@/lib/utils/origin-validation';
import { QueueRepository } from './repository';
import { IssuanceConflict } from './domain';

export class HttpError extends Error {constructor(readonly status:number,message:string){super(message);}}
export async function authorize(request:NextRequest,scope:string,mutating=false):Promise<{id:string;machine:boolean}> {
  const db=createAdminClient();
  const bearer=request.headers.get('authorization');
  if(bearer){
    const token=bearer.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token)throw new HttpError(401,'Invalid machine credential');
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const {data,error}=await db.from('integration_credentials').select('id,scopes,revoked_at').eq('token_hash',tokenHash).maybeSingle();
    if(error||!data||data.revoked_at)throw new HttpError(401,'Invalid machine credential');
    if(!(data.scopes as string[]).includes(scope))throw new HttpError(403,'Credential scope does not permit this operation');
    const allowed=await new QueueRepository(db).rpc<boolean>('consume_integration_quota',{p_id:data.id});
    if(!allowed)throw new HttpError(429,'Machine request rate limit exceeded');
    return {id:data.id,machine:true};
  }
  if(process.env.ADMIN_PANEL_ENABLED!=='true')throw new HttpError(403,'Admin panel is disabled');
  const result=await requireAdminUser();
  if(!result.ok)throw new HttpError(result.status,result.error);
  if(mutating&&!isTrustedOrigin(request))throw new HttpError(403,'Untrusted request origin');
  const allowed=await new QueueRepository(db).rpc<boolean>('consume_api_quota',{p_key:`admin:${result.user.id}`,p_limit:120});
  if(!allowed)throw new HttpError(429,'Request rate limit exceeded');
  return {id:result.user.id,machine:false};
}
export async function readJson(request:NextRequest,maxBytes=2*1024*1024):Promise<unknown> {
  if(Number(request.headers.get('content-length')??0)>maxBytes)throw new HttpError(413,'Request exceeds 2 MB');
  const reader=request.body?.getReader();
  if(!reader)throw new HttpError(400,'JSON request body is required');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw new HttpError(413,'Request exceeds 2 MB');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON');}
}
export async function endpoint(operation:()=>Promise<unknown>,status=200):Promise<NextResponse> {
  try{return NextResponse.json(await operation(),{status,headers:{'Cache-Control':'private, no-store'}});}
  catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:'Invalid request',details:error.issues.map(issue=>({path:issue.path,message:issue.message}))},{status:400,headers:{'Cache-Control':'no-store'}});
    if(error instanceof HttpError)return NextResponse.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store',...(error.status===429?{'Retry-After':'60'}:{})}});
    if(error instanceof IssuanceConflict)return NextResponse.json({error:error.message},{status:409,headers:{'Cache-Control':'no-store'}});
    if(error instanceof Error&&/^Upload a font file for /.test(error.message))return NextResponse.json({error:error.message},{status:422,headers:{'Cache-Control':'no-store'}});
    if(error instanceof Error&&error.message==='Idempotency conflict')return NextResponse.json({error:error.message},{status:409,headers:{'Cache-Control':'no-store'}});
    const incidentId=randomUUID();console.error(JSON.stringify({event:'issuance_api_failed',incidentId}));
    return NextResponse.json({error:'Operation failed',incidentId},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
