import type {PGlite} from '@electric-sql/pglite';
import type {SupabaseClient} from '@supabase/supabase-js';
function identifier(value:string):string {if(!/^[a-z_][a-z0-9_]*$/i.test(value))throw new Error(`Unsafe SQL identifier: ${value}`);return `"${value}"`;}
function normalize(value:unknown):unknown {
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(normalize);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,normalize(child)]));
 return value;
}
/** Only the external Supabase transport/storage boundary is replaced; PostgreSQL owns all job state.
 * PGlite serializes one connection: concurrent worker loops exercise orchestration, not multi-connection lock contention.
 */
export function createAdapter(db:PGlite) {
 const objects=new Map<string,Uint8Array>();
 const uploads:string[]=[];const downloads:string[]=[];const rpcErrors:{name:string;message:string}[]=[];
 class Builder {
  private columns='*';private filters:{sql:string;value?:unknown}[]=[];private sorting='';private maximum:number|undefined;
  private operation:'select'|'update'|'insert'='select';private payload:Record<string,unknown>|Record<string,unknown>[]={};
  constructor(private table:string){identifier(table);}
  select(columns='*'){this.columns=columns==='*'?'*':columns.split(',').map(x=>identifier(x.trim())).join(',');return this;}
  eq(column:string,value:unknown){this.filters.push({sql:`${identifier(column)} = ?`,value});return this;}
  in(column:string,values:unknown[]){if(!values.length)this.filters.push({sql:'false'});else this.filters.push({sql:`${identifier(column)} = ANY (?)`,value:values});return this;}
  is(column:string,value:null){if(value!==null)throw new Error('Adapter is() supports null only');this.filters.push({sql:`${identifier(column)} IS NULL`});return this;}
  order(column:string,options:{ascending?:boolean}={}){this.sorting=` ORDER BY ${identifier(column)} ${options.ascending===false?'DESC':'ASC'}`;return this;}
  limit(value:number){if(!Number.isInteger(value)||value<0)throw new Error('Invalid limit');this.maximum=value;return this;}
  update(payload:Record<string,unknown>){this.operation='update';this.payload=payload;return this;}
  insert(payload:Record<string,unknown>|Record<string,unknown>[]){this.operation='insert';this.payload=payload;return this;}
  private async execute(mode:'many'|'single'|'maybe'='many') {
   try {
    const values:unknown[]=[];const parameter=(value:unknown)=>{values.push(value);return `$${values.length}`;};
    let sql='';
    if(this.operation==='select')sql=`SELECT ${this.columns} FROM public.${identifier(this.table)}`;
    else if(this.operation==='update')sql=`UPDATE public.${identifier(this.table)} SET ${Object.entries(this.payload).map(([key,value])=>`${identifier(key)}=${parameter(value&&typeof value==='object'?JSON.stringify(value):value)}`).join(',')}`;
    else {
     const rows=Array.isArray(this.payload)?this.payload:[this.payload];const keys=Object.keys(rows[0]);
     sql=`INSERT INTO public.${identifier(this.table)} (${keys.map(identifier).join(',')}) VALUES ${rows.map(row=>`(${keys.map(key=>parameter(row[key]&&typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(',')})`).join(',')}`;
    }
    if(this.filters.length)sql+=' WHERE '+this.filters.map(filter=>filter.sql.replace('?',()=>parameter(filter.value))).join(' AND ');
    if(this.operation==='select')sql+=this.sorting+(this.maximum===undefined?'':` LIMIT ${this.maximum}`);
    else sql+=` RETURNING ${this.columns}`;
    const result=await db.query(sql,values);const rows=normalize(result.rows) as Record<string,unknown>[];
    if(mode==='single'&&rows.length!==1)throw new Error(`Expected exactly one row, got ${rows.length}`);
    if(mode==='maybe'&&rows.length>1)throw new Error('Expected at most one row');
    return {data:mode==='many'?rows:rows[0]??null,error:null};
   }catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}
  }
  single(){return this.execute('single');}maybeSingle(){return this.execute('maybe');}
  then<TResult1=Awaited<ReturnType<Builder['execute']>>,TResult2=never>(onfulfilled?:((value:Awaited<ReturnType<Builder['execute']>>)=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null){return this.execute().then(onfulfilled,onrejected);}
 }
 const transport={
  from:(table:string)=>new Builder(table),
  async rpc(name:string,args:Record<string,unknown>) {
   try {
    identifier(name);const names=Object.keys(args);names.forEach(identifier);
    const metadata=await db.query<{proretset:boolean;typname:string;proargnames:string[];types:string}>(`SELECT p.proretset,t.typname,p.proargnames,oidvectortypes(p.proargtypes) types FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_type t ON t.oid=p.prorettype WHERE n.nspname='public' AND p.proname=$1`,[name]);
    if(metadata.rows.length!==1)throw new Error('Expected one RPC function');const meta=metadata.rows[0];const types=meta.types.split(', ');
    const values=names.map(key=>{const type=types[meta.proargnames.indexOf(key)];if(!type)throw new Error(`Unknown RPC argument ${key}`);const value=args[key];return value!==null&&typeof value==='object'&&type==='jsonb'?JSON.stringify(value):value;});
    const parameters=names.map((key,index)=>`${identifier(key)} => $${index+1}::${types[meta.proargnames.indexOf(key)]}`).join(',');
    const query=meta.proretset?`SELECT * FROM public.${identifier(name)}(${parameters})`:`SELECT public.${identifier(name)}(${parameters}) AS data`;
    const result=await db.query<{data:unknown}>(query,values);return {data:normalize(meta.proretset?result.rows:result.rows[0]?.data??null),error:null};
   }catch(error){const message=error instanceof Error?error.message:String(error);rpcErrors.push({name,message});return {data:null,error:{message}};}
  },
  storage:{from:(bucket:string)=>({
   async upload(path:string,bytes:Uint8Array,options:{upsert?:boolean}={}){const key=`${bucket}/${path}`;uploads.push(key);if(objects.has(key)&&!options.upsert)return {data:null,error:{message:'Object already exists'}};objects.set(key,new Uint8Array(bytes));return {data:{path},error:null};},
   async download(path:string){const key=`${bucket}/${path}`;downloads.push(key);const bytes=objects.get(key);return bytes?{data:new Blob([Buffer.from(bytes)]),error:null}:{data:null,error:{message:'Object not found'}};},
  })},
 };
 return {client:transport as unknown as SupabaseClient,objects,uploads,downloads,rpcErrors};
}
