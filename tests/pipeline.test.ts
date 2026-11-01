import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {NextRequest} from 'next/server';
import {GET as publicPdf} from '../app/api/verify/[code]/pdf/route';
import {createTestDatabase} from './helpers/database';
import {createAdapter} from './helpers/supabase-adapter';
import type {EmailMessage,EmailProvider} from '../lib/email/provider';
const boundary=vi.hoisted(()=>({client:null as unknown,actor:'00000000-0000-4000-8000-000000000001'}));
vi.mock('../lib/supabase/admin',()=>({createAdminClient:()=>boundary.client}));
vi.mock('../lib/auth/admin',()=>({requireAdminUser:async()=>({ok:true,user:{id:boundary.actor,app_metadata:{role:'admin'}}})}));
import {POST as submitApi} from '../app/api/issuance/batches/route';
import {POST as controlApi} from '../app/api/issuance/batches/[id]/route';
import {submitBatch,batchDetail,generateManualPdf} from '../lib/issuance/service';
import {QueueRepository} from '../lib/issuance/repository';
import {runWorker} from '../lib/issuance/worker';
beforeEach(()=>{vi.spyOn(console,'log').mockImplementation(()=>{});vi.stubEnv('ADMIN_PANEL_ENABLED','true');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function fixture(count=1) {
 const db=await createTestDatabase();const adapter=createAdapter(db);boundary.client=adapter.client;
 const png=await sharp({create:{width:640,height:480,channels:3,background:'#fff'}}).png().toBuffer();
 adapter.objects.set('templates/base.png',png);
 const template=(await db.query<{id:string}>(`INSERT INTO templates(name,image_url,name_x,name_y,link_x,link_y,image_width,image_height) VALUES('Offline','http://localhost:54321/storage/v1/object/public/templates/base.png',320,200,320,350,640,480) RETURNING id`)).rows[0].id;
 const event=(await db.query<{id:string}>(`INSERT INTO events(name,date_of_issue,certificate_type) VALUES('Vertical Slice','2026-10-25','Participation') RETURNING id`)).rows[0].id;
 const folder=(await db.query<{id:string}>(`INSERT INTO folders(name) VALUES('Pipeline') RETURNING id`)).rows[0].id;
 const request={event_id:event,template_id:template,folder_id:folder,send_email:true,idempotency_key:randomUUID(),recipients:Array.from({length:count},(_,index)=>({name:`Recipient ${index}`,email:`recipient${index}@example.test`}))};
 boundary.actor=randomUUID();
 return {db,adapter,request,creator:boundary.actor,repo:new QueueRepository(adapter.client)};
}
function provider(messages:EmailMessage[]):EmailProvider{return {name:'capture',async send(message){messages.push(message);return {outcome:'accepted_by_provider',providerId:message.messageId};}};}
async function drain(repo:QueueRepository,mail:EmailProvider){await runWorker(repo,{provider:mail,leaseSeconds:120,cooldownMs:0,concurrency:2,once:true,signal:new AbortController().signal});}
describe('real issuance vertical slice',()=>{
 it('adopts an existing historical PDF without regenerating it from an edited template',async()=>{
  const f=await fixture();try{
    const old=await PDFDocument.create();old.addPage([100,100]);const bytes=await old.save();
    const path='legacy/ORIGINAL1234.pdf';f.adapter.objects.set(`certificates/${path}`,bytes);
    const certificate=(await f.db.query<{id:string}>(`INSERT INTO certificates(certificate_code,name,email,event_name,folder_id,template_id,pdf_url) VALUES('ORIGINAL1234','Historical','old@example.test','Original Event',$1,$2,$3) RETURNING id`,[f.request.folder_id,f.request.template_id,`http://localhost:54321/storage/v1/object/sign/certificates/${path}?token=expired`])).rows[0].id;
    await generateManualPdf(certificate);
    const result=(await f.db.query<{pdf_object_path:string;pdf_sha256:string;render_snapshot:unknown}>('SELECT pdf_object_path,pdf_sha256,render_snapshot FROM certificates WHERE id=$1',[certificate])).rows[0];
    expect(result.pdf_object_path).toBe(path);expect(result.pdf_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(result.render_snapshot).toBeNull();
    expect(f.adapter.uploads.filter(key=>key.startsWith('certificates/'))).toHaveLength(0);
  }finally{await f.db.close();}
 });
 it('issues 100 frozen PDFs and accepts 100 emails, with idempotent cross-batch reuse',async()=>{
  const f=await fixture(100);try {
   const response=await submitApi(new NextRequest('http://localhost:3000/api/issuance/batches',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost:3000'},body:JSON.stringify(f.request)}));
   expect(response.status).toBe(201);const batch=(await response.json()).batchId as string;expect(await submitBatch(f.request,f.creator)).toBe(batch);
   await drain(f.repo,provider([]));expect((await f.db.query('SELECT * FROM certificates')).rows).toHaveLength(0);
   const approval=await controlApi(new NextRequest(`http://localhost:3000/api/issuance/batches/${batch}`,{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost:3000'},body:JSON.stringify({action:'approve'})}),{params:Promise.resolve({id:batch})});expect(approval.status).toBe(200);const messages:EmailMessage[]=[];await drain(f.repo,provider(messages));
   const detail=await batchDetail(batch);expect(detail.summary).toMatchObject({total:100,accepted:100,delivered:0,pending:0});expect(messages).toHaveLength(100);
   expect((await f.db.query('SELECT * FROM email_attempts')).rows).toHaveLength(100);
   const certificates=await f.db.query<{pdf_object_path:string;pdf_sha256:string;certificate_code:string}>('SELECT pdf_object_path,pdf_sha256,certificate_code FROM certificates');expect(certificates.rows).toHaveLength(100);
   for(const cert of certificates.rows){const bytes=f.adapter.objects.get(`certificates/${cert.pdf_object_path}`)!;expect(createHash('sha256').update(bytes).digest('hex')).toBe(cert.pdf_sha256);expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);}
   for(const message of messages){expect(message.text).toContain('http://localhost:3000/api/verify/');expect(message.text).not.toContain('token=');expect(message.subject).toBe('Thank you for participating in Vertical Slice – Certificate');}
   const again=await submitBatch({...f.request,idempotency_key:randomUUID()},f.creator,true);await drain(f.repo,provider(messages));
   expect((await f.db.query('SELECT * FROM certificates')).rows).toHaveLength(100);expect(messages).toHaveLength(100);expect((await f.db.query('SELECT * FROM email_attempts')).rows).toHaveLength(100);expect((await batchDetail(again)).summary.pending).toBe(0);
  } finally {await f.db.close();}
 },60000);
});

it('recovers upload-before-completion failure with the same content artifact',async()=>{
 const f=await fixture();try {
  const batch=await submitBatch(f.request,f.creator,true);let interrupted=false;
  const complete=f.repo.complete.bind(f.repo);
  vi.spyOn(f.repo,'complete').mockImplementation(async(item,result)=>{if(item.stage==='pdf'&&!interrupted){interrupted=true;throw new Error('Simulated database acknowledgement loss after upload');}return complete(item,result);});
  const messages:EmailMessage[]=[];await drain(f.repo,provider(messages));expect(interrupted).toBe(true);expect(messages).toHaveLength(0);
  const before=[...f.adapter.objects.keys()].filter(key=>key.startsWith('certificates/'));expect(before).toHaveLength(1);
  await f.db.exec(`UPDATE issuance_items SET available_at=clock_timestamp() WHERE state='retry'`);
  await drain(new QueueRepository(f.adapter.client),provider(messages));
  expect([...f.adapter.objects.keys()].filter(key=>key.startsWith('certificates/'))).toEqual(before);expect(messages).toHaveLength(1);expect((await batchDetail(batch)).summary.accepted).toBe(1);
 }finally{await f.db.close();}
});
it('quarantines a transport timeout after durable SMTP intent without replay',async()=>{
 const f=await fixture();try {
  const batch=await submitBatch(f.request,f.creator,true);let calls=0;
  const timeout:EmailProvider={name:'capture',async send(){calls++;throw new Error('Timeout after DATA; acknowledgement lost');}};
  await drain(f.repo,timeout);expect(calls,JSON.stringify(f.adapter.rpcErrors)).toBe(1);
  expect((await f.db.query('SELECT state FROM issuance_items')).rows).toEqual([{state:'review_required'}]);
  expect((await f.db.query('SELECT outcome FROM email_attempts')).rows).toEqual([{outcome:'ambiguous'}]);
  await f.repo.rpc('control_issuance_batch',{p_batch_id:batch,p_action:'retry'});await drain(f.repo,timeout);expect(calls).toBe(1);
 }finally{await f.db.close();}
});
it('revocation after PDF processing prevents sending and checked downloads',async()=>{
 const f=await fixture();try {
  await submitBatch(f.request,f.creator,true);const complete=f.repo.complete.bind(f.repo);
  vi.spyOn(f.repo,'complete').mockImplementation(async(item,result)=>{await complete(item,result);if(item.stage==='pdf')await f.db.query('UPDATE certificates SET is_valid=false WHERE id=$1',[item.certificate_id]);});
  const messages:EmailMessage[]=[];await drain(f.repo,provider(messages));expect(messages).toHaveLength(0);expect((await f.db.query('SELECT * FROM email_attempts')).rows).toHaveLength(0);
  const cert=(await f.db.query<{certificate_code:string}>('SELECT certificate_code FROM certificates')).rows[0];const before=f.adapter.downloads.length;
  const response=await publicPdf(new NextRequest(`http://localhost:3000/api/verify/${cert.certificate_code}/pdf`),{params:Promise.resolve({code:cert.certificate_code})});
  expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toContain('no-store');expect(f.adapter.downloads.length).toBe(before);
 }finally{await f.db.close();}
});
