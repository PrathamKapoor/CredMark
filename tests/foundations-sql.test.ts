import {describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const canonical=readFileSync('supabase/schema.sql','utf8');
const migration=readFileSync('supabase/migrations/202610250001_foundations.sql','utf8');
describe('foundation SQL against disposable Postgres',()=>{
 it('repairs both legacy column sets and preserves certificate records',async()=>{
  for(const variant of ['schema','master','readme']) {
   const db=new PGlite();
   try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
     CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
     CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
     CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
     GRANT USAGE ON SCHEMA storage,auth TO anon,authenticated;
     GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
     CREATE POLICY legacy_unrestricted_storage ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);`);
    if(variant==='readme') {
      await db.exec(`CREATE TABLE templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,image_url text NOT NULL,link_x int DEFAULT 0,link_y int DEFAULT 0,link_width int DEFAULT 100,link_height int DEFAULT 20,created_at timestamptz DEFAULT now());
      CREATE TABLE certificates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),certificate_code text UNIQUE NOT NULL,name text NOT NULL,email text NOT NULL,event_name text,date_of_issue date,template_image_url text,pdf_url text,is_valid boolean DEFAULT true,created_at timestamptz DEFAULT now());
      INSERT INTO certificates(certificate_code,name,email,event_name) VALUES('ABCDEFGH2345','Recipient','private@example.test','Event');`);
    }else{
      const tables=canonical.match(/CREATE TABLE IF NOT EXISTS public\.\w+ \([\s\S]*?\n\);/g)!;
      await db.exec(tables.join('\n').replaceAll('uuid_generate_v4()','gen_random_uuid()'));
      await db.exec(`INSERT INTO public.folders(id,name) VALUES('00000000-0000-0000-0000-000000000001','Legacy');
     INSERT INTO public.certificates(certificate_code,name,email,event_name,folder_id) VALUES('ABCDEFGH2345','Recipient','private@example.test','Event','00000000-0000-0000-0000-000000000001');
     ALTER TABLE public.templates DROP COLUMN placeholders; ALTER TABLE public.certificates DROP COLUMN custom_fields;`);
    }
    if(variant==='schema') await db.exec('ALTER TABLE public.templates DROP COLUMN custom_fonts; ALTER TABLE public.templates DROP COLUMN link_italic;');
    await db.exec(migration);await db.exec(migration);
    expect((await db.query<{n:number}>('SELECT count(*)::int n FROM public.certificates')).rows[0].n).toBe(1);
    expect((await db.query<{ok:boolean}>(`SELECT has_table_privilege('anon','public.certificates','SELECT') ok`)).rows[0].ok).toBe(false);
    await db.exec(`SELECT set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',false)`);
    expect((await db.query<{ok:boolean}>('SELECT public.is_admin() ok')).rows[0].ok).toBe(false);
    await db.exec('SET ROLE authenticated');
    expect((await db.query('SELECT * FROM public.certificates')).rows).toHaveLength(0);
    await db.exec('RESET ROLE; SET ROLE service_role');
    expect((await db.query('SELECT * FROM public.certificates')).rows).toHaveLength(1);
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(db.query('SELECT * FROM public.certificates')).rejects.toThrow();
    expect((await db.query(`SELECT * FROM public.verify_certificate('ABCDEFGH2345')`)).rows).toHaveLength(1);
    await db.exec('RESET ROLE');
    const buckets=await db.query<{id:string,public:boolean}>('SELECT id,public FROM storage.buckets ORDER BY id');
    expect(buckets.rows).toEqual([{id:'certificates',public:false},{id:'issuance-assets',public:false},{id:'templates',public:true}]);
    await db.exec(`INSERT INTO storage.objects(bucket_id) VALUES('templates'),('certificates'),('issuance-assets'); SET ROLE anon;`);
    expect((await db.query('SELECT bucket_id FROM storage.objects')).rows).toEqual([{bucket_id:'templates'}]);
    await expect(db.query(`INSERT INTO storage.objects(bucket_id) VALUES('templates')`)).rejects.toThrow();
    await db.exec('RESET ROLE');
    const valid=await db.query<{name:string}> (`SELECT * FROM public.verify_certificate('ABCDEFGH2345')`);expect(valid.rows[0].name).toBe('Recipient');
    expect((await db.query(`SELECT folder_id FROM certificates WHERE certificate_code='ABCDEFGH2345'`)).rows[0]).toMatchObject({folder_id:expect.any(String)});
    await db.exec(`INSERT INTO certificates(certificate_code,name,email,event_name,folder_id) SELECT 'LDNYEW7K',name,email,event_name,folder_id FROM certificates LIMIT 1`);
    expect((await db.query(`SELECT * FROM verify_certificate('LDNYEW7K')`)).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM public.verify_certificate('%')`)).rows).toHaveLength(0);
    await db.exec(`UPDATE public.certificates SET is_valid=false`);
    const revoked=await db.query<{name:null,is_valid:boolean}>(`SELECT * FROM public.verify_certificate('ABCDEFGH2345')`);expect(revoked.rows[0]).toMatchObject({name:null,is_valid:false});
   } finally {await db.close();}
  }
 });
});
