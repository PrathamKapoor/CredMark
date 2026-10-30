import {describe,it,expect,vi,beforeEach} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({user:{id:'admin',app_metadata:{role:'admin'}},enqueue:vi.fn(async()=> 'batch-id'),origin:true,pdf:vi.fn(async()=>({pdfUrl:'/api/verify/ABCDEFGH2345/pdf'}))}));
vi.mock('../lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})}));
vi.mock('../lib/utils/origin-validation',()=>({isTrustedOrigin:()=>state.origin}));
vi.mock('../lib/issuance/service',()=>({enqueueManualEmails:state.enqueue,generateManualPdf:state.pdf}));
import {POST} from '../app/api/certificates/[id]/email/route';
import {POST as bulkPOST} from '../app/api/certificates/bulk-email/route';
import {POST as pdfPOST} from '../app/api/certificates/[id]/pdf/route';
beforeEach(()=>{state.origin=true;state.user={id:'admin',app_metadata:{role:'admin'}};state.enqueue.mockClear();});
describe('manual email API durable enqueue',()=>{
 it('queues without claiming sent',async()=>{const response=await POST(new NextRequest('https://example.test',{method:'POST'}),{params:Promise.resolve({id:'certificate-id'})});expect(response.status).toBe(202);expect(await response.json()).toMatchObject({queued:true,batchId:'batch-id',message:'Email queued'});expect(state.enqueue).toHaveBeenCalledOnce();});
 it('rejects untrusted origin before enqueue',async()=>{state.origin=false;const response=await POST(new NextRequest('https://example.test',{method:'POST'}),{params:Promise.resolve({id:'certificate-id'})});expect(response.status).toBe(403);expect(state.enqueue).not.toHaveBeenCalled();});
});

describe('manual route adapters',()=>{
 it('bulk queues a durable job with caller idempotency key',async()=>{
  const response=await bulkPOST(new NextRequest('https://example.test',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':'fixed-key'},body:JSON.stringify({certificateIds:['00000000-0000-4000-8000-000000000001'],skipAlreadySent:false})}));
  expect(response.status).toBe(202);expect((await response.json()).batchId).toBe('batch-id');expect(state.enqueue).toHaveBeenCalledWith(['00000000-0000-4000-8000-000000000001'],'admin','fixed-key',true);
 });
 it('PDF regeneration uses the shared service',async()=>{
  const response=await pdfPOST(new NextRequest('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regenerate:true})}),{params:Promise.resolve({id:'certificate-id'})});
  expect(response.status).toBe(200);expect(state.pdf).toHaveBeenCalledWith('certificate-id',true);expect((await response.json()).pdfUrl).toBe('/api/verify/ABCDEFGH2345/pdf');
 });
 it('non-admin cannot enqueue',async()=>{
  state.user.app_metadata.role='user';const response=await POST(new NextRequest('https://example.test',{method:'POST'}),{params:Promise.resolve({id:'certificate-id'})});expect(response.status).toBe(403);expect(state.enqueue).not.toHaveBeenCalled();
 });
});
