/** Exact-code lookup and private storage boundaries shared by public readers. */
export function normalizePublicCode(code: string): string | null {
 const normalized = code.toUpperCase();
 return /^[A-Z0-9][A-Z0-9-]{7,63}$/.test(normalized) ? normalized : null;
}
function safePath(path: string): string | null {
 if (!path || path.startsWith('/') || /[\\?#\x00-\x1f]/.test(path) || path.split('/').some(s=>!s || s==='.' || s==='..')) return null;
 return path;
}
export function certificateObjectPath(certificate: {pdf_object_path?: string | null; pdf_url?: string | null}, projectUrl: string): string | null {
 if (certificate.pdf_object_path) return safePath(certificate.pdf_object_path);
 try {
  const url = new URL(certificate.pdf_url ?? '');
  const project = new URL(projectUrl);
  if(url.origin!==project.origin || url.username || url.password) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/certificates\/(.+)$/);
  return match ? safePath(decodeURIComponent(match[1])) : null;
 } catch {return null;}
}
export const PRIVATE_PDF_HEADERS = {'Cache-Control':'private, no-store, max-age=0', 'X-Robots-Tag':'noindex, nofollow'};
