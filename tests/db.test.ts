import { describe, it, expect } from 'vitest';
import { createTestDatabase } from './helpers/database';
describe('durable database', () => {
 it('rejects idempotency conflicts and requires approval', async () => {
 const db=await createTestDatabase();
 try {
 const event=(await db.query<{id:string}>(`insert into events(name) values ('Test') returning id`)).rows[0].id;
 const template=(await db.query<{id:string}>(`insert into templates(name,image_url) values ('Test','https://example.test/a.png') returning id`)).rows[0].id;
 const args=[event,template,null,'request','hash',JSON.stringify([{recipient_key:'a',name:'A',email:'a@example.test'}]),'{}',false];
 const q=`select submit_issuance_batch($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) id`;
 const id=(await db.query<{id:string}>(q,args)).rows[0].id;
 expect((await db.query(q,args)).rows[0]).toEqual({id});
 await expect(db.query(q,[...args.slice(0,4),'different',...args.slice(5)])).rejects.toThrow();
 expect((await db.query(`select * from claim_issuance_item('worker')`)).rows).toHaveLength(0);
 await db.query(`select approve_issuance_batch($1)`,[id]);
 const item=(await db.query<{id:string;fencing_token:number}>(`select * from claim_issuance_item('worker')`)).rows[0];
 await expect(db.query(`select complete_issuance_stage($1,'worker',$2,'{}')`,[item.id,Number(item.fencing_token)+1])).rejects.toThrow();
 } finally { await db.close(); }
 });
});

async function seed(db: Awaited<ReturnType<typeof createTestDatabase>>, email=true) {
 const event=(await db.query<{id:string}>(`insert into events(name) values ('Test') returning id`)).rows[0].id;
 const template=(await db.query<{id:string}>(`insert into templates(name,image_url) values ('Test','https://example.test/a.png') returning id`)).rows[0].id;
 const batch=(await db.query<{id:string}>(`select submit_issuance_batch($1,$2,null,'key','hash',$3::jsonb,'{}',$4,true) id`,[event,template,JSON.stringify([{name:'A',email:'a@example.test'}]),email])).rows[0].id;
 return batch;
}
async function claim(db: Awaited<ReturnType<typeof createTestDatabase>>, worker='w') {
 return (await db.query<{id:string;certificate_id:string;fencing_token:number;stage:string}>(`select * from claim_issuance_item($1)`,[worker])).rows[0];
}
async function advanceToEmail(db: Awaited<ReturnType<typeof createTestDatabase>>) {
 await seed(db);
 let item=await claim(db);
 await db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token]);
 item=await claim(db);
 await db.query(`select complete_issuance_stage($1,'w',$2,$3::jsonb)`,[item.id,item.fencing_token,JSON.stringify({object_path:'certificates/a.pdf',sha256:'a'.repeat(64)})]);
 return claim(db);
}
it('reclaims expired leases with a new fence and rejects late completion',async()=>{
 const db=await createTestDatabase(); try {
 await seed(db); const first=await claim(db);
 await db.query(`update issuance_items set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[first.id]);
 const second=await claim(db,'other'); expect(Number(second.fencing_token)).toBeGreaterThan(Number(first.fencing_token));
 await expect(db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[first.id,first.fencing_token])).rejects.toThrow();
 await db.query(`select complete_issuance_stage($1,'other',$2,'{}')`,[second.id,second.fencing_token]);
 expect((await db.query(`select * from certificates`)).rows).toHaveLength(1);
 }finally{await db.close();}
});
it('quarantines a worker death after durable SMTP intent and never retries it',async()=>{
 const db=await createTestDatabase(); try{
 const item=await advanceToEmail(db);
 await db.query(`select begin_email_attempt($1,'w',$2,'fake','<test@example.test>',1000)`,[item.id,item.fencing_token]);
 await db.query(`update issuance_items set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[item.id]);
 expect(await claim(db)).toBeUndefined();
 expect((await db.query(`select outcome from email_attempts`)).rows).toEqual([{outcome:'ambiguous'}]);
 const row=(await db.query<{batch_id:string;state:string}>(`select batch_id,state from issuance_items`)).rows[0]; expect(row.state).toBe('review_required');
 await db.query(`select control_issuance_batch($1,'retry')`,[row.batch_id]); expect(await claim(db)).toBeUndefined();
 }finally{await db.close();}
});
it('pause and revocation stop an email before intent; service-only grants hold',async()=>{
 const db=await createTestDatabase(); try{
 const item=await advanceToEmail(db);
 const batch=(await db.query<{batch_id:string}>(`select batch_id from issuance_items where id=$1`,[item.id])).rows[0].batch_id;
 await db.query(`select control_issuance_batch($1,'pause')`,[batch]);
 await expect(db.query(`select begin_email_attempt($1,'w',$2,'fake','test',0)`,[item.id,item.fencing_token])).rejects.toThrow();
 await db.query(`select control_issuance_batch($1,'resume')`,[batch]);
 await db.query(`update certificates set is_valid=false where id=$1`,[item.certificate_id]);
 await expect(db.query(`select begin_email_attempt($1,'w',$2,'fake','test',0)`,[item.id,item.fencing_token])).rejects.toThrow();
 await db.exec(`set role anon`);
 await expect(db.query(`select * from claim_issuance_item('attacker')`)).rejects.toThrow();
 await expect(db.query(`select * from email_attempts`)).rejects.toThrow();
 await db.exec(`reset role; set role authenticated`);
 expect((await db.query(`select * from issuance_items`)).rows).toHaveLength(0);
 }finally{await db.close();}
});
it('accepted SMTP survives worker death without a second send',async()=>{
 const db=await createTestDatabase();try{
 const item=await advanceToEmail(db);
 const attempt=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test',0) id`,[item.id,item.fencing_token])).rows[0].id;
 await db.query(`select finish_email_attempt($1,'w',$2,$3,'accepted_by_provider','fake-id',null)`,[item.id,item.fencing_token,attempt]);
 await db.query(`update issuance_items set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[item.id]);
 expect(await claim(db)).toBeUndefined();
 expect((await db.query(`select stage,state from issuance_items`)).rows).toEqual([{stage:'done',state:'completed'}]);
 expect((await db.query(`select * from email_attempts`)).rows).toHaveLength(1);
 }finally{await db.close();}
});
it('requires explicit reconciliation before retrying unknown delivery',async()=>{
 const db=await createTestDatabase();try{
 const item=await advanceToEmail(db);
 const attempt=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test',0) id`,[item.id,item.fencing_token])).rows[0].id;
 await db.query(`select finish_email_attempt($1,'w',$2,$3,'ambiguous',null,'timeout')`,[item.id,item.fencing_token,attempt]);
 await expect(db.query(`select reconcile_email_attempt($1,'failed','')`,[attempt])).rejects.toThrow();
 await db.query(`select reconcile_email_attempt($1,'failed','Provider logs confirm message was never accepted')`,[attempt]);
 const batch=(await db.query<{batch_id:string}>(`select batch_id from issuance_items where id=$1`,[item.id])).rows[0].batch_id;
 await db.query(`select control_issuance_batch($1,'retry')`,[batch]); expect((await claim(db)).id).toBe(item.id);
 expect((await db.query(`select * from job_events where event='email_reconciled'`)).rows).toHaveLength(1);
 }finally{await db.close();}
});
it('shares provider pacing across requests and enforces credential quotas',async()=>{
 const db=await createTestDatabase();try{
 const item=await advanceToEmail(db);
 await db.query(`insert into provider_pacing values ('fake',clock_timestamp()+interval '1 hour')`);
 expect((await db.query<{id:null}>(`select begin_email_attempt($1,'w',$2,'fake','test',500) id`,[item.id,item.fencing_token])).rows[0].id).toBeNull();
 expect((await db.query(`select * from email_attempts`)).rows).toHaveLength(0);
 const credential=(await db.query<{id:string}>(`insert into integration_credentials(name,token_hash,requests_per_minute) values ('Test','hash',1) returning id`)).rows[0].id;
 expect((await db.query<{ok:boolean}>(`select consume_integration_quota($1) ok`,[credential])).rows[0].ok).toBe(true);
 expect((await db.query<{ok:boolean}>(`select consume_integration_quota($1) ok`,[credential])).rows[0].ok).toBe(false);
 await db.exec(`set role authenticated; set "request.jwt.claims"='{"app_metadata":{"role":"admin"}}'`);
 await expect(db.query(`select token_hash from integration_credentials`)).rejects.toThrow();
 }finally{await db.close();}
});
it('suppresses overlapping manual sends and requires explicit resend after acceptance',async()=>{
 const db=await createTestDatabase();try{
 const item=await advanceToEmail(db);
 await db.query(`select enqueue_existing_email(array[$1::uuid],null,'manual-overlap',false)`,[item.certificate_id]);
 expect((await db.query(`select state from issuance_items where batch_id=(select id from issuance_batches where idempotency_key='manual-overlap')`)).rows).toEqual([{state:'suppressed'}]);
 const attempt=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test',0) id`,[item.id,item.fencing_token])).rows[0].id;
 await db.query(`select finish_email_attempt($1,'w',$2,$3,'accepted_by_provider','fake-id',null)`,[item.id,item.fencing_token,attempt]);
 await db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token]);
 await db.query(`select enqueue_existing_email(array[$1::uuid],null,'manual-suppressed',false)`,[item.certificate_id]);
 await db.query(`select enqueue_existing_email(array[$1::uuid],null,'manual-resend',true)`,[item.certificate_id]);
 const resend=await claim(db); expect(resend.certificate_id).toBe(item.certificate_id);
 const next=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test-resend',0) id`,[resend.id,resend.fencing_token])).rows[0].id; expect(next).toBeTruthy();
 }finally{await db.close();}
});
it('defers pacing without burning retries and ingests replay-safe bounce suppression',async()=>{
 const db=await createTestDatabase();try{
 let item=await advanceToEmail(db);
 await db.query(`select defer_issuance_item($1,'w',$2,1)`,[item.id,item.fencing_token]);
 expect((await db.query<{attempt_count:number}>(`select attempt_count from issuance_items where id=$1`,[item.id])).rows[0].attempt_count).toBe(0);
 await db.query(`update issuance_items set available_at=clock_timestamp()-interval '1 second' where id=$1`,[item.id]); item=await claim(db);
 const attempt=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test',0) id`,[item.id,item.fencing_token])).rows[0].id;
 await db.query(`select finish_email_attempt($1,'w',$2,$3,'accepted_by_provider','message-1',null)`,[item.id,item.fencing_token,attempt]);
 await db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token]);
 await db.exec(`select record_delivery_event('event-1','fake','message-1','bounced'); select record_delivery_event('event-1','fake','message-1','bounced'); select record_delivery_event('event-2','fake','message-1','delivered');`);
 expect((await db.query(`select outcome from email_attempts`)).rows).toEqual([{outcome:'bounced'}]);
 expect((await db.query(`select * from email_suppressions`)).rows).toHaveLength(1);
 expect((await db.query(`select * from job_events where event='delivery_bounced'`)).rows).toHaveLength(1);
 await db.query(`select enqueue_existing_email(array[$1::uuid],null,'blocked-resend',true)`,[item.certificate_id]); const resend=await claim(db);
 await expect(db.query(`select begin_email_attempt($1,'w',$2,'fake','resend',0)`,[resend.id,resend.fencing_token])).rejects.toThrow('Recipient suppressed');
 }finally{await db.close();}
});
it('enforces API global quotas and audits a fenced suppression',async()=>{
 const db=await createTestDatabase();try{
 expect((await db.query<{ok:boolean}>(`select consume_api_quota('admin:test',1) ok`)).rows[0].ok).toBe(true);
 expect((await db.query<{ok:boolean}>(`select consume_api_quota('admin:test',1) ok`)).rows[0].ok).toBe(false);
 await expect(db.query(`select consume_api_quota('admin:test',1001)`)).rejects.toThrow();
 const batch=await seed(db,false);const item=await claim(db);
 await db.query(`select skip_issuance_item($1,'w',$2,'operator_cancelled')`,[item.id,item.fencing_token]);
 expect((await db.query(`select status from issuance_batches where id=$1`,[batch])).rows).toEqual([{status:'completed'}]);
 expect((await db.query(`select event from job_events where event='suppressed'`)).rows).toHaveLength(1);
 await db.exec(`set role anon`);await expect(db.query(`select consume_api_quota('attack',1000)`)).rejects.toThrow();
 }finally{await db.close();}
});
it('rejects logical identity recipient conflicts and reuses the original frozen snapshot',async()=>{
 const db=await createTestDatabase();try{
 const batch=await seed(db,false); let item=await claim(db);
 await db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token]);
 await db.exec(`update issuance_items set state='completed'`);
 const original=(await db.query<{id:string;render_snapshot:unknown}>(`select id,render_snapshot from certificates`)).rows[0];
 const info=(await db.query<{event_id:string;template_id:string}>(`select event_id,template_id from issuance_batches where id=$1`,[batch])).rows[0];
 async function duplicate(key:string,name:string){await db.query(`select submit_issuance_batch($1,$2,null,$3,'hash',$4::jsonb,'{"newSnapshot":true}',false,true)`,[info.event_id,info.template_id,key,JSON.stringify([{name,email:'a@example.test'}])]);return claim(db);}
 item=await duplicate('same','A');await db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token]);
 expect((await db.query(`select id,render_snapshot from certificates`)).rows).toEqual([original]);
 await db.exec(`update issuance_items set state='completed'`);
 item=await duplicate('different','Wrong recipient');
 await expect(db.query(`select complete_issuance_stage($1,'w',$2,'{}')`,[item.id,item.fencing_token])).rejects.toThrow('Issuance identity conflict');
 expect((await db.query(`select * from certificates`)).rows).toHaveLength(1);
 }finally{await db.close();}
});
it('freezes an exact envelope, blocks active address edits, and completes known acceptance after failure',async()=>{
 const db=await createTestDatabase();try{
 const item=await advanceToEmail(db);
 const c=(await db.query<{name:string;email:string;event_name:string;certificate_code:string}>(`select name,email,event_name,certificate_code from certificates where id=$1`,[item.certificate_id])).rows[0];
 const payload={...c,message:{to:c.email,subject:'Certificate',html:'<p>Test</p>',text:'Test'}};
 await expect(db.query(`select begin_email_attempt($1,'w',$2,'fake','test',0,$3::jsonb)`,[item.id,item.fencing_token,JSON.stringify({...payload,email:'wrong@example.test'})])).rejects.toThrow('Recipient changed');
 const attempt=(await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','test',0,$3::jsonb) id`,[item.id,item.fencing_token,JSON.stringify(payload)])).rows[0].id;
 expect((await db.query(`select recipient_email,payload from email_attempts`)).rows).toEqual([{recipient_email:c.email,payload}]);
 await expect(db.query(`select update_certificate_email($1,'new@example.test')`,[item.certificate_id])).rejects.toThrow('Email intent active');
 await db.query(`select finish_email_attempt($1,'w',$2,$3,'accepted_by_provider','fake',null)`,[item.id,item.fencing_token,attempt]);
 await db.query(`select fail_issuance_item($1,'w',$2,'Completion response lost','transient')`,[item.id,item.fencing_token]);
 expect((await db.query(`select stage,state from issuance_items`)).rows).toEqual([{stage:'done',state:'completed'}]);
 await db.query(`select update_certificate_email($1,'new@example.test')`,[item.certificate_id]);
 expect((await db.query(`select email,email_sent from certificates`)).rows).toEqual([{email:'new@example.test',email_sent:false}]);
 await db.query(`select enqueue_existing_email(array[$1::uuid],null,'changed-address',false)`,[item.certificate_id]);
 const next=await claim(db);expect(next).toBeTruthy();
 expect((await db.query<{id:string}>(`select begin_email_attempt($1,'w',$2,'fake','new',0) id`,[next.id,next.fencing_token])).rows[0].id).toBeTruthy();
 await db.exec(`select record_delivery_event('late-bounce','fake','fake','bounced')`);
 expect((await db.query(`select email from email_suppressions`)).rows).toEqual([{email:c.email}]);
 }finally{await db.close();}
});
