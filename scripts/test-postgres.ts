/** Real multi-connection integration check. Only disposable local PostgreSQL is allowed. */
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { databaseFixtureSql } from '../tests/helpers/database';

async function main() {
 const source=process.env.DATABASE_TEST_URL;
 if(!source) throw new Error('DATABASE_TEST_URL is required; PostgreSQL integration tests cannot be skipped');
 const url=new URL(source);
 if(!['localhost','127.0.0.1','[::1]','postgres'].includes(url.hostname)) throw new Error('PostgreSQL tests require a disposable local/CI host');
 const admin=new Client({connectionString:source}); await admin.connect();
 const name=`truemark_test_${randomUUID().replaceAll('-','')}`;
 const clients:Client[]=[];
 try {
 await admin.query(`CREATE DATABASE "${name}"`);
 url.pathname=`/${name}`;
 for(let i=0;i<3;i++){const client=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000});await client.connect();await client.query(`SET statement_timeout='15s'`);clients.push(client);}
 const [setup,a,b]=clients;
 const scripts=databaseFixtureSql();
 // Roles are cluster-wide and may already exist in a reused CI PostgreSQL instance.
 scripts[0]=scripts[0].replace(/CREATE ROLE (anon|authenticated|service_role)( BYPASSRLS)?;/g,(_,role:string,extra:string='')=>`DO $$ BEGIN CREATE ROLE ${role}${extra}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
 for(const sql of scripts)await setup.query(sql);
 const event=(await setup.query(`insert into events(name) values ('Concurrency') returning id`)).rows[0].id;
 const template=(await setup.query(`insert into templates(name,image_url) values ('Test','https://example.test/a.png') returning id`)).rows[0].id;
 const recipients=JSON.stringify([{name:'A',email:'a@example.test'},{name:'B',email:'b@example.test'}]);
 await setup.query(`select submit_issuance_batch($1,$2,null,'parallel','hash',$3,'{}',false,true)`,[event,template,recipients]);
 // Keep connection A's row lock open while B must claim a different row via SKIP LOCKED.
 await a.query('BEGIN');
 const first=(await a.query(`select * from claim_issuance_item('worker-a')`)).rows[0];
 const second=(await b.query(`select * from claim_issuance_item('worker-b')`)).rows[0];
 assert.ok(first && second); assert.notEqual(first.id,second.id);
 await a.query('COMMIT');
 assert.equal((await setup.query(`select * from claim_issuance_item('worker-c')`)).rowCount,0);
 await setup.query(`update issuance_items set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[first.id]);
 const reclaimed=(await b.query(`select * from claim_issuance_item('replacement')`)).rows[0];
 assert.equal(reclaimed.id,first.id);assert.ok(BigInt(reclaimed.fencing_token)>BigInt(first.fencing_token));
 await assert.rejects(a.query(`select complete_issuance_stage($1,'worker-a',$2,'{}')`,[first.id,first.fencing_token]),/Stale or expired lease/);
 await b.query(`select complete_issuance_stage($1,'replacement',$2,'{}')`,[reclaimed.id,reclaimed.fencing_token]);
 assert.equal((await setup.query('select count(*)::int n from certificates')).rows[0].n,1);
 console.log('PostgreSQL integration passed: competing claims skip locked rows, no duplicate claim, expired lease fenced, one certificate committed.');
 }finally{
 await Promise.all(clients.map(client=>client.end()));
 await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
 await admin.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
