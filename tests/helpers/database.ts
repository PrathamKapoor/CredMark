import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export function databaseFixtureSql(): string[] {
 return [
 `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text primary key,name text,public boolean); CREATE TABLE storage.objects(id uuid,bucket_id text,name text); CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;`,
 readFileSync('supabase/schema.sql','utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',()=> 'CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;'),
 readFileSync('supabase/migrations/202610250001_foundations.sql','utf8'),
 readFileSync('supabase/migrations/202610250002_issuance.sql','utf8')];
}
export async function createTestDatabase() {
 const db = new PGlite();
 try { for (const sql of databaseFixtureSql()) await db.exec(sql); return db; }
 catch(error) { await db.close(); throw error; }
}
