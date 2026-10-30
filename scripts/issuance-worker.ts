import { createAdminClient } from '../lib/supabase/admin';
import { createEmailProvider } from '../lib/email/provider';
import { QueueRepository } from '../lib/issuance/repository';
import { runWorker } from '../lib/issuance/worker';

async function main(){
  if(process.argv.includes('--check')) {
    console.log('Worker modules loaded. Postgres RPC queue; bounded concurrency; no network or email attempted.');return;
  }
  for(const name of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_BASE_URL']) if(!process.env[name])throw new Error(`${name} is required`);
  const controller=new AbortController();
  process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
  const concurrency=Number(process.env.WORKER_CONCURRENCY??2),leaseSeconds=Number(process.env.WORKER_LEASE_SECONDS??120),cooldownMs=Number(process.env.EMAIL_COOLDOWN_MS??3000);
  if(!Number.isInteger(leaseSeconds)||leaseSeconds<60||leaseSeconds>3600)throw new Error('Worker lease must be between 60 and 3600 seconds');
  if(!Number.isInteger(cooldownMs)||cooldownMs<1000||cooldownMs>3600000)throw new Error('Email cooldown must be between 1000 and 3600000 milliseconds');
  const provider=createEmailProvider();
  if(provider.name==='gmail'&&process.env.EMAIL_DELIVERY_ENABLED!=='true')throw new Error('Set EMAIL_DELIVERY_ENABLED=true explicitly to permit Gmail delivery');
  console.log(JSON.stringify({event:'worker_started',concurrency,leaseSeconds,provider:provider.name,cooldownMs}));
  await runWorker(new QueueRepository(createAdminClient()),{provider,concurrency,leaseSeconds,cooldownMs,signal:controller.signal,once:process.argv.includes('--once')});
}
main().catch(()=>{console.error('Worker stopped: configuration, database, or processing error. No secret values are logged.');process.exitCode=1;});
