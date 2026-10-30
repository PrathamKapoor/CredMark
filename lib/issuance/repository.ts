import type { SupabaseClient } from '@supabase/supabase-js';
import type { Item } from './domain';
import type { Certificate } from '@/lib/types/database';

export interface Claim extends Item {batch_id:string;owner:string;fencing_token:number;stage:'issue'|'pdf'|'email';input:Record<string,unknown>}
export class QueueRepository {
  constructor(readonly db:SupabaseClient){}
  async rpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
    const {data,error}=await this.db.rpc(name,args);
    if(error) throw new Error(error.message);
    return data as T;
  }
  async claim(worker:string,leaseSeconds=120):Promise<Claim|null> {
    const rows=await this.rpc<Claim[]>('claim_issuance_item',{p_worker:worker,p_lease_seconds:leaseSeconds});
    return rows[0]??null;
  }
  fence(item:Claim){return {p_id:item.id,p_worker:item.owner,p_fence:item.fencing_token};}
  heartbeat(item:Claim,leaseSeconds:number){return this.rpc('heartbeat_issuance_item',{...this.fence(item),p_lease_seconds:leaseSeconds});}
  complete(item:Claim,result:Record<string,unknown>={}){return this.rpc('complete_issuance_stage',{...this.fence(item),p_result:result});}
  fail(item:Claim,error:string,classification:string){return this.rpc('fail_issuance_item',{...this.fence(item),p_error:error,p_class:classification});}
  async certificate(id:string):Promise<Certificate> {
    const {data,error}=await this.db.from('certificates').select('*').eq('id',id).single();
    if(error||!data) throw new Error('Certificate not found');return data as Certificate;
  }
  async batch(id:string){
    const {data,error}=await this.db.from('issuance_batches').select('*').eq('id',id).single();
    if(error||!data) throw new Error('Batch not found');
    return data as {id:string;status:string;render_snapshot:unknown};
  }
}
