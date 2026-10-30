import { describe,it,expect } from 'vitest';
import { processClaim,runWorker } from '@/lib/issuance/worker';
import type { Claim } from '@/lib/issuance/repository';

function fixture(outcome:'accepted_by_provider'|'ambiguous'|'retryable') {
  const events:string[]=[];
  const claim={id:'item',batch_id:'batch',owner:'worker',fencing_token:1,stage:'email',state:'running',input:{},certificate_id:'cert'} as Claim;
  const repo={
    fence:()=>({p_id:'item',p_worker:'worker',p_fence:1}),
    async heartbeat(){events.push('heartbeat');},
    async certificate(){return {id:'cert',is_valid:true,name:'Asha',email:'asha@example.com',event_name:'Workshop',certificate_code:'ABCDEF123456',pdf_object_path:'issued/c.pdf'};},
    async batch(){return {status:'running'};},
    async rpc(name:string,args:Record<string,unknown>){events.push(name+(args.p_outcome?`:${args.p_outcome}`:''));return 'attempt';},
    async complete(){events.push('complete');},async fail(_item:Claim,_error:string,kind:string){events.push(`fail:${kind}`);},
  };
  const provider={name:'capture',async send(){events.push('SMTP');return {outcome};}};
  return {repo,provider,claim,events};
}
describe('worker email state ordering',()=>{
  it('stops every claim loop after a database connection fails',async()=>{
    let calls=0;
    const controller=new AbortController();
    const repo={async claim(){calls++;if(calls===1)throw new Error('Database disconnected');return null;}};
    try{
      await expect(runWorker(repo as never,{provider:fixture('accepted_by_provider').provider,leaseSeconds:120,concurrency:2,signal:controller.signal})).rejects.toThrow('Database disconnected');
      await new Promise(resolve=>setTimeout(resolve,1100));
      expect(calls).toBeLessThanOrEqual(2);
    }finally{controller.abort();}
  });
  it('records intent before sending and acceptance before completing',async()=>{
    const f=fixture('accepted_by_provider');await processClaim(f.repo as never,f.claim,{provider:f.provider,leaseSeconds:120});
    expect(f.events.indexOf('begin_email_attempt')).toBeLessThan(f.events.indexOf('SMTP'));
    expect(f.events.indexOf('finish_email_attempt:accepted_by_provider')).toBeLessThan(f.events.indexOf('complete'));
  });
  it('quarantines an ambiguous outcome without completing or scheduling resend',async()=>{
    const f=fixture('ambiguous');await processClaim(f.repo as never,f.claim,{provider:f.provider,leaseSeconds:120});
    expect(f.events).toContain('finish_email_attempt:ambiguous');
    expect(f.events).not.toContain('complete');
    expect(f.events.some(e=>e.startsWith('fail:'))).toBe(false);
  });
  it('records definitive failure before retry scheduling',async()=>{
    const f=fixture('retryable');await processClaim(f.repo as never,f.claim,{provider:f.provider,leaseSeconds:120});
    expect(f.events.indexOf('finish_email_attempt:failed')).toBeLessThan(f.events.indexOf('fail:transient'));
  });
  it('never sends if the claim has been lost',async()=>{
    const f=fixture('accepted_by_provider');f.repo.heartbeat=async()=>{throw new Error('Stale or expired lease');};
    await processClaim(f.repo as never,f.claim,{provider:f.provider,leaseSeconds:120});
    expect(f.events).not.toContain('SMTP');
  });
});
