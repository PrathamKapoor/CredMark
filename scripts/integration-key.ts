import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--help') || !args.length) {console.log('Create a scoped integration credential:\nnpm run integration:key -- --create --name=importer --scopes=batches:write,batches:read\nAllowed scopes: batches:write,batches:read,batches:approve,events:write,events:read.\nRequires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Raw token is printed once; only its SHA-256 hash is stored.');return;}
  if(args.some(arg=>arg!=='--create' && !arg.startsWith('--name=') && !arg.startsWith('--scopes=')))throw new Error('Unknown credential argument');
  if(!args.includes('--create'))throw new Error('Explicit --create is required');
  const name=args.find(arg=>arg.startsWith('--name='))?.slice(7).trim();
  const scopes=args.find(arg=>arg.startsWith('--scopes='))?.slice(9).split(',');
  if(!name || name.length>120)throw new Error('--name must contain 1–120 characters');
  if(!scopes?.length || scopes.some(scope=>!['batches:write','batches:read','batches:approve','events:write','events:read'].includes(scope)) || new Set(scopes).size!==scopes.length)throw new Error('Use unique scopes from batches:write,batches:read,batches:approve,events:write,events:read');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !serviceKey)throw new Error('Supabase URL and service role key are required');
  const raw=randomBytes(32).toString('hex');
  const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await client.from('integration_credentials').insert({name,token_hash:createHash('sha256').update(raw).digest('hex'),scopes});
  if(error)throw new Error(`Credential creation failed: ${error.code || 'database error'}`);
  console.log('Save this token now in your integration secret store. It cannot be recovered:');
  console.log(raw);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Credential creation failed');process.exitCode=1;});
