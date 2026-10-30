import { createAdminClient } from '../lib/supabase/admin';
import { certificateObjectPath } from '../lib/verification/public';
async function main(){
  if(process.argv.includes('--help')){console.log('npm run pdf:backfill -- [--apply]\nDefault is read-only inventory. Only own-project certificate Storage URLs are accepted. No objects are deleted or regenerated.');return;}
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--apply'))throw new Error('Unknown argument');
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Supabase server credentials are required');
  const db=createAdminClient(),apply=args.includes('--apply');let cursor='',examined=0,valid=0,unresolved=0,updated=0;
  while(true){
    let query=db.from('certificates').select('id,pdf_url').is('pdf_object_path',null).not('pdf_url','is',null).order('id',{ascending:true}).limit(100);
    if(cursor)query=query.gt('id',cursor);
    const {data,error}=await query;if(error)throw new Error('Cannot inventory legacy PDF records');if(!data.length)break;
    for(const row of data){
      examined++;const path=certificateObjectPath(row,process.env.NEXT_PUBLIC_SUPABASE_URL);
      if(!path){unresolved++;continue;}valid++;
      if(apply){const result=await db.from('certificates').update({pdf_object_path:path}).eq('id',row.id).is('pdf_object_path',null).eq('pdf_url',row.pdf_url).select('id').maybeSingle();if(result.error)throw new Error('Legacy path update failed');if(result.data)updated++;}
    }
    cursor=data[data.length-1].id;
  }
  console.log(JSON.stringify({mode:apply?'apply':'read-only',examined,valid,unresolved,updated}));
}
main().catch(()=>{console.error('Legacy PDF inventory/backfill failed. No files were deleted or regenerated.');process.exitCode=1;});
