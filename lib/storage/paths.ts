import { certificateObjectPath } from '@/lib/verification/public';

export function legacyObjectPath(url:string,projectUrl:string):string|null {
  return certificateObjectPath({pdf_url:url},projectUrl);
}
export function stableDownloadUrl(code:string,baseUrl=process.env.NEXT_PUBLIC_BASE_URL):string {
  if(!baseUrl) throw new Error('NEXT_PUBLIC_BASE_URL is required');
  return new URL(`/api/verify/${encodeURIComponent(code)}/pdf`,baseUrl).toString();
}
