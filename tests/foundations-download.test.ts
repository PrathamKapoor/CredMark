import { describe,it,expect,vi,beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({allowed:true,valid:true,adminCalls:0,downloads:0}));
vi.mock('../lib/utils/rate-limit',()=>({checkPublicPdfRateLimit:async()=>({allowed:state.allowed})}));
vi.mock('../lib/supabase/admin',()=>({createAdminClient:()=>{state.adminCalls++;return {from:()=>({select:()=>({eq:()=>({single:async()=>({data:{certificate_code:'ABCDEFGH2345',is_valid:state.valid,pdf_object_path:'event/test.pdf'},error:null})})})}),storage:{from:()=>({download:async()=>{state.downloads++;return {data:new Blob(['pdf']),error:null};}})}}}}));
import {GET} from '../app/api/verify/[code]/pdf/route';
beforeEach(()=>Object.assign(state,{allowed:true,valid:true,adminCalls:0,downloads:0}));
describe('public PDF boundary',()=>{
 it('rate checks before service-role access',async()=>{state.allowed=false; const result=await GET(new NextRequest('https://example.test'),{params:Promise.resolve({code:'ABCDEFGH2345'})});expect(result.status).toBe(429);expect(state.adminCalls).toBe(0);});
 it('denies revoked artifacts without reading storage',async()=>{state.valid=false;const result=await GET(new NextRequest('https://example.test'),{params:Promise.resolve({code:'ABCDEFGH2345'})});expect(result.status).toBe(404);expect(state.downloads).toBe(0);expect(result.headers.get('cache-control')).toContain('no-store');});
 it('streams private objects without caching',async()=>{const result=await GET(new NextRequest('https://example.test'),{params:Promise.resolve({code:'ABCDEFGH2345'})});expect(result.status).toBe(200);expect(await result.text()).toBe('pdf');expect(result.headers.get('cache-control')).toContain('private, no-store');expect(state.downloads).toBe(1);});
});
