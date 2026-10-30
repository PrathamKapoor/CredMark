import { createHash } from 'node:crypto';
export class IssuanceConflict extends Error {}

export interface Item {
  id: string; batch_id?: string; recipient_key?: string;
  stage: string; state: string; certificate_id?: string | null;
  input?: Record<string, unknown>; last_error?: string | null;
  attempt_count?: number; max_attempts?: number; owner?: string | null;
  fencing_token?: number; lease_until?: string | null;
  pdf_ready?: boolean;
}
export interface Attempt { item_id: string; outcome: string; provider_id?: string | null }
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function payloadDigest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
export function summarizeBatch(items: Item[], attempts: Attempt[]) {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) latest.set(attempt.item_id, attempt);
  const outcomes = [...latest.values()];
  return {
    total:items.length, validated:items.length,
    certificates:items.filter(i=>i.certificate_id).length,
    pdfs:items.filter(i=>i.pdf_ready??(i.stage==='email'||i.stage==='done')).length,
    queuedEmails:items.filter(i=>i.stage==='email'&&['queued','retry'].includes(i.state)).length,
    accepted:outcomes.filter(a=>['accepted_by_provider','delivered'].includes(a.outcome)).length,
    delivered:outcomes.filter(a=>a.outcome==='delivered').length,
    bounced:outcomes.filter(a=>a.outcome==='bounced').length,
    pending:items.filter(i=>['queued','running','retry'].includes(i.state)).length,
    failed:items.filter(i=>i.state==='failed').length,
    ambiguous:items.filter(i=>i.state==='review_required').length,
    completed:items.filter(i=>i.state==='completed').length,
    suppressed:items.filter(i=>i.state==='suppressed').length,
  };
}
function csvCell(value: unknown): string {
  let text=String(value??'');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}
export function reportCsv(items:Item[],attempts:Attempt[]):string {
  const latest=new Map(attempts.map(a=>[a.item_id,a]));
  return [['item_id','name','email','certificate_id','stage','state','email_outcome','attempts','last_error'],...items.map(i=>[i.id,i.input?.name,i.input?.email,i.certificate_id,i.stage,i.state,latest.get(i.id)?.outcome,i.attempt_count,i.last_error])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
