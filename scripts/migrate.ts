import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const paths = ['supabase/schema.sql','supabase/migrations/202610250001_foundations.sql','supabase/migrations/202610250002_issuance.sql'];
type Migration = {version:string;path:string;sha256:string;sql:string};
async function plan():Promise<Migration[]> {
  return Promise.all(paths.map(async (path,index) => {
    const source = await readFile(resolve(path),'utf8');
    if (/(?:^|;)\s*(?:DROP\s+TABLE|TRUNCATE\s+(?:TABLE\s+)?[a-z_])/im.test(source.replace(/--[^\n]*/g,''))) throw new Error(`Destructive table operation in ${path}`);
    const sql=source.replace(/^\s*(?:--[^\n]*\n\s*)*BEGIN\s*;/i,'').replace(/COMMIT\s*;\s*$/i,'');
    if(sql===source || /\b(?:BEGIN|COMMIT)\s*;/i.test(sql.replace(/\$\$[\s\S]*?\$\$/g,''))) throw new Error(`Expected one outer transaction in ${path}`);
    return {version:index===0?'202610250000_schema':path.split('/').at(-1)!.replace(/\.sql$/,''),path,sha256:createHash('sha256').update(source).digest('hex'),sql};
  }));
}
async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--help')) { console.log('npm run migrate -- --check  (offline plan/checksums)\nALLOW_DATABASE_MIGRATIONS=true DATABASE_URL=... npm run migrate'); return; }
  if(args.some(arg=>arg!=='--check')) throw new Error('Unknown migration argument');
  const migrations=await plan();
  if(args.includes('--check')) { for(const migration of migrations) console.log(`${migration.version} ${migration.sha256} ${migration.path}`); console.log('Offline migration plan validated; no database connection made.');return; }
  if(process.env.ALLOW_DATABASE_MIGRATIONS!=='true') throw new Error('Set ALLOW_DATABASE_MIGRATIONS=true to explicitly enable database changes');
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('truemark_schema_migrations'))`);
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied=new Map((await client.query<{version:string;sha256:string}>('SELECT version,sha256 FROM public.schema_migrations')).rows.map(row=>[row.version,row.sha256]));
    for(const migration of migrations) if(applied.has(migration.version) && applied.get(migration.version)!==migration.sha256) throw new Error(`Applied migration checksum changed: ${migration.version}`);
    const existing=(await client.query(`SELECT to_regclass('public.templates') IS NOT NULL AS present`)).rows[0].present;
    if(!existing && applied.size) throw new Error('Migration history exists but templates table is missing; inspect the database before proceeding');
    for(const migration of migrations) {
      if(applied.has(migration.version) || (existing && migration===migrations[0])) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO public.schema_migrations(version,sha256) VALUES ($1,$2)',[migration.version,migration.sha256]);
        await client.query('COMMIT');console.log(`Applied ${migration.version}`);
      } catch(error) {await client.query('ROLLBACK');throw error;}
    }
    console.log('Migration plan complete. Historical migrations and master_setup.sql were not executed.');
  } finally {await client.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
