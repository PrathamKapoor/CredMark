import { beforeEach,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authorize,readJson,endpoint } from '@/lib/issuance/http';

const fixtures=vi.hoisted(()=>({user:null as null|{id:string;app_metadata:Record<string,string>;user_metadata?:Record<string,string>},credential:null as null|{id:string;scopes:string[];revoked_at:string|null},allowed:true}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:fixtures.user},error:null})}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:fixtures.credential,error:null})})})}),
  rpc:async()=>({data:fixtures.allowed,error:null}),
})}));
beforeEach(()=>{process.env.ADMIN_PANEL_ENABLED='true';fixtures.user=null;fixtures.credential=null;fixtures.allowed=true;});
it('denies anonymous administration and forged user_metadata roles',async()=>{
  const request=new NextRequest('http://localhost:3000/api/issuance/batches');
  expect((await endpoint(()=>authorize(request,'batches:read'))).status).toBe(401);
  fixtures.user={id:'user',app_metadata:{},user_metadata:{role:'admin'}};
  expect((await endpoint(()=>authorize(request,'batches:read'))).status).toBe(403);
});
it('requires trusted origin for cookie-authenticated mutation',async()=>{
  fixtures.user={id:'admin',app_metadata:{role:'admin'}};
  const request=new NextRequest('http://localhost:3000/api/issuance/batches',{method:'POST',headers:{origin:'https://attacker.example'}});
  expect((await endpoint(()=>authorize(request,'batches:write',true))).status).toBe(403);
});
it('requires machine scope and respects revocation and persistent quota',async()=>{
  const request=new NextRequest('http://localhost:3000/api/issuance/batches',{headers:{authorization:`Bearer ${'a'.repeat(64)}`}});
  fixtures.credential={id:'machine',scopes:['batches:read'],revoked_at:null};
  expect((await endpoint(()=>authorize(request,'batches:write',true))).status).toBe(403);
  expect(await authorize(request,'batches:read')).toEqual({id:'machine',machine:true});
  fixtures.allowed=false;
  expect((await endpoint(()=>authorize(request,'batches:read'))).status).toBe(429);
  fixtures.credential.revoked_at='2026-01-01';
  expect((await endpoint(()=>authorize(request,'batches:read'))).status).toBe(401);
});
it('bounds streamed request bytes even without Content-Length',async()=>{
  const request=new NextRequest('http://localhost:3000/api/issuance/batches',{method:'POST',body:'x'.repeat(100)});
  const result=await endpoint(()=>readJson(request,20));
  expect(result.status).toBe(413);
  expect(result.headers.get('cache-control')).toBe('no-store');
});
it('rejects malformed JSON without exposing internals',async()=>{
  const request=new NextRequest('http://localhost:3000/api/issuance/batches',{method:'POST',body:'{'});
  expect((await endpoint(()=>readJson(request))).status).toBe(400);
});
