import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Template, Certificate } from '@/lib/types/database';
import { fetchSafeTemplateImage } from '@/lib/utils/safe-url';
import { generateCertificatePdf } from '@/lib/pdf/generate-certificate';
import { certificateObjectPath } from '@/lib/verification/public';
import { stableDownloadUrl } from '@/lib/storage/paths';

export interface Asset {path:string;sha256:string}
export interface RenderSnapshot {
  version:1; template:Template; baseUrl:string; createdAt:string;
  assets:{image:Asset;fonts:Record<string,Asset>};
  event?:{id:string;name:string;date_of_issue:string;certificate_type:string};
}
export const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function isSnapshot(value:unknown):value is RenderSnapshot {
  return !!value&&typeof value==='object'&&'version' in value&&value.version===1&&'assets'in value&&'template'in value;
}
async function download(db:SupabaseClient,bucket:string,path:string):Promise<Uint8Array> {
  const {data,error}=await db.storage.from(bucket).download(path);
  if(error||!data) throw new Error(`Cannot read ${bucket} artifact`);
  return new Uint8Array(await data.arrayBuffer());
}
async function sourceBytes(db:SupabaseClient,url:string):Promise<Uint8Array> {
  const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const source=new URL(url);
  const match=source.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/templates\/(.+)$/);
  if(source.origin===project.origin&&match) {
    const path=decodeURIComponent(match[1]);
    if(path.split('/').some(s=>!s||s==='.'||s==='..')||/[\\\x00-\x1f]/.test(path)) throw new Error('Invalid template asset path');
    return download(db,'templates',path);
  }
  const response=await fetchSafeTemplateImage(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('Cannot fetch template asset');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>15*1024*1024) throw new Error('Template asset exceeds 15 MB');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>15*1024*1024) throw new Error('Template asset exceeds 15 MB');
  return bytes;
}
async function freezeAsset(db:SupabaseClient,bytes:Uint8Array):Promise<Asset> {
  const hash=sha256(bytes),path=`sha256/${hash}`;
  const {error}=await db.storage.from('issuance-assets').upload(path,bytes,{upsert:false,contentType:'application/octet-stream'});
  if(error){
    // An interrupted previous approval may already have written this exact immutable asset.
    const existing=await download(db,'issuance-assets',path);
    if(sha256(existing)!==hash) throw new Error('Immutable asset checksum conflict');
  }
  return {path,sha256:hash};
}
function standardFamily(family:string):string|null {
  const primary=family.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
  if(['serif','georgia','times','times new roman'].includes(primary)) return 'serif';
  if(['monospace','courier','courier new'].includes(primary)) return 'courier';
  if(['sans-serif','arial','helvetica','verdana','system-ui'].includes(primary)) return 'sans-serif';
  return null;
}
export async function freezeRendering(db:SupabaseClient,original:Template,baseUrl:string):Promise<RenderSnapshot> {
  const template=structuredClone(original);
  const fonts:Record<string,Asset>={};
  const mapping=template.custom_font_files??{};
  const normalize=(s:string)=>s.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
  async function resolve(family:string|null):Promise<string> {
    const standard=standardFamily(family??'serif');
    const key=Object.keys(mapping).find(k=>normalize(k)===normalize(family??''));
    if(key){fonts[family!]=await freezeAsset(db,await sourceBytes(db,mapping[key]));return family!;}
    if(standard) return standard;
    throw new Error(`Upload a font file for ${family} before automated issuance`);
  }
  for(const key of ['name_font_family','event_font_family','date_font_family','link_font_family'] as const) template[key]=await resolve(template[key]);
  for(const placeholder of template.placeholders??[]) placeholder.fontFamily=await resolve(placeholder.fontFamily);
  const image=await freezeAsset(db,await sourceBytes(db,template.image_url));
  return {version:1,template,baseUrl:new URL(baseUrl).origin,createdAt:new Date().toISOString(),assets:{image,fonts}};
}
async function readAsset(db:SupabaseClient,asset:Asset):Promise<Uint8Array> {
  const bytes=await download(db,'issuance-assets',asset.path);
  if(sha256(bytes)!==asset.sha256) throw new Error('Frozen asset checksum mismatch');
  return bytes;
}
export async function renderSnapshotPdf(db:SupabaseClient,certificate:Certificate,snapshot:RenderSnapshot) {
  const imageBytes=await readAsset(db,snapshot.assets.image);
  const fontBytes:Record<string,Uint8Array>={};
  for(const [name,asset] of Object.entries(snapshot.assets.fonts)) fontBytes[name]=await readAsset(db,asset);
  return generateCertificatePdf({certificate,template:snapshot.template,imageBytes,fontBytes,baseUrl:snapshot.baseUrl,strictFonts:true});
}
export async function ensurePdfArtifact(db:SupabaseClient,certificate:Certificate,snapshot:RenderSnapshot,regenerate=false) {
  const existing=certificateObjectPath(certificate,process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(!regenerate&&existing&&certificate.pdf_sha256){
    try {const bytes=await download(db,'certificates',existing);if(sha256(bytes)===certificate.pdf_sha256)return {object_path:existing,sha256:certificate.pdf_sha256,render_snapshot:snapshot,pdf_url:stableDownloadUrl(certificate.certificate_code,snapshot.baseUrl)};}catch{/* Regenerate only a missing or corrupt artifact from the frozen inputs. */}
  }
  const {pdfBytes}=await renderSnapshotPdf(db,certificate,snapshot);
  const hash=sha256(pdfBytes),path=`issued/${certificate.id}/${hash}.pdf`;
  const {error}=await db.storage.from('certificates').upload(path,pdfBytes,{contentType:'application/pdf',upsert:false});
  if(error){const bytes=await download(db,'certificates',path);if(sha256(bytes)!==hash)throw new Error('Stored PDF checksum conflict');}
  return {object_path:path,sha256:hash,render_snapshot:snapshot,pdf_url:stableDownloadUrl(certificate.certificate_code,snapshot.baseUrl)};
}
