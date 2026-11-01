'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseCsv } from '@/lib/issuance/csv';
import { BatchSubmissionSchema, EventSubmissionSchema, validateRecipients, type RecipientInput } from '@/lib/issuance/validation';
import './circulation.css';

type Choice = {id:string;name:string};
type TemplateChoice = Choice & {placeholders?:{key:string;label:string;isLink:boolean}[]};
type EventChoice = Choice & {date_of_issue:string;certificate_type:string};
type Batch = {id:string;status:string;created_at?:string;send_email?:boolean};
type Item = {id:string;stage:string;state:string;input:{name:string;email:string;existing_certificate_id?:string};last_error?:string;attempt_count?:number;certificate_id?:string};
type Attempt = {id:string;item_id:string;outcome:string;provider_id?:string;error?:string};
type Detail = {batch:Batch;items:Item[];summary:Record<string,number>;attempts?:Attempt[]};
async function request<T>(url:string,body?:unknown):Promise<T> {
  const response = await fetch(url,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {cache:'no-store'});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
export default function CirculationClient({templates,folders}:{templates:TemplateChoice[];folders:Choice[]}) {
  const [events,setEvents]=useState<EventChoice[]>([]); const [batches,setBatches]=useState<Batch[]>([]); const [detail,setDetail]=useState<Detail|null>(null);
  const [eventId,setEventId]=useState(''); const [templateId,setTemplateId]=useState(''); const [folderId,setFolderId]=useState(''); const [sendEmail,setSendEmail]=useState(false);
  const [newEvent,setNewEvent]=useState({name:'',date_of_issue:'',certificate_type:'Participation'});
  const [headers,setHeaders]=useState<string[]>([]); const [rawRows,setRawRows]=useState<string[][]>([]); const [mapping,setMapping]=useState<Record<string,string>>({});
  const [recipients,setRecipients]=useState<RecipientInput[]>([]); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false); const [search,setSearch]=useState(''); const [filter,setFilter]=useState(''); const [updated,setUpdated]=useState('');
  const [reconciliation,setReconciliation]=useState<Record<string,{outcome:string;note:string;confirmed:boolean}>>({});
  const key=useRef(''); const selected=useRef<string|null>(null);
  const refresh=useCallback(async () => {
    const [eventData,batchData]=await Promise.all([request<{events:EventChoice[]}>('/api/issuance/events'),request<{batches:Batch[]}>('/api/issuance/batches')]);
    setEvents(eventData.events);setBatches(batchData.batches);
    if (selected.current) setDetail(await request<Detail>(`/api/issuance/batches/${selected.current}`));
    setUpdated(new Date().toLocaleTimeString());
  },[]);
  useEffect(() => { let alive=true; const poll=()=>{if (document.visibilityState==='visible') refresh().catch(error=>{if(alive)setMessage(error.message);});}; poll(); const interval=setInterval(poll,3000);return()=>{alive=false;clearInterval(interval);}; },[refresh]);
  useEffect(()=>{key.current='';},[recipients,eventId,templateId,folderId,sendEmail]);
  const errors=useMemo(()=>validateRecipients(recipients),[recipients]);
  const custom=templates.find(t=>t.id===templateId)?.placeholders?.filter(p=>!p.isLink && !['name','event','date'].includes(p.key)) || [];
  async function run(action:()=>Promise<void>) {setBusy(true);setMessage('');try{await action();}catch(error){setMessage(error instanceof Error ? error.message : 'Operation failed.');}finally{setBusy(false);}}
  function mapRows() {
    if (!mapping.name || !mapping.email) {setMessage('Map a name and email column first.');return;}
    const get=(row:string[],field:string)=>row[headers.indexOf(mapping[field])] || '';
    setRecipients(rawRows.map(row=>({name:get(row,'name'),email:get(row,'email'),...(mapping.recipient_key && get(row,'recipient_key').trim() ? {recipient_key:get(row,'recipient_key')} : {}),custom_fields:Object.fromEntries([...headers.filter(h=>![mapping.name,mapping.email,mapping.recipient_key].includes(h)).map(h=>[h,row[headers.indexOf(h)]]),...custom.filter(p=>mapping[p.key]).map(p=>[p.key,get(row,p.key)])])})));setMessage('Review and edit recipients below before creating the draft.');
  }
  async function openBatch(id:string) {selected.current=id;setDetail(await request<Detail>(`/api/issuance/batches/${id}`));}
  const visible=detail?.items.filter(item=>(!filter || item.state===filter) && `${item.input.name} ${item.input.email}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <div className="circulation">
    <header><h1 className="page-title">Circulation</h1><p className="page-subtitle">Preview recipients, approve once, and follow persistent certificate and delivery progress.</p></header>
    {message && <p className="circulation-notice" role="status">{message}</p>}
    <section className="circulation-panel" aria-labelledby="configure"><h2 id="configure">1. Configure a draft</h2>
      <div className="circulation-grid">
        <label>Event<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Choose event</option>{events.map(e=><option key={e.id} value={e.id}>{e.name} · {e.certificate_type} · {e.date_of_issue}</option>)}</select></label>
        <label>Template<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Choose template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Destination folder<select value={folderId} onChange={e=>setFolderId(e.target.value)}><option value="">Choose folder</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Distribution<select value={String(sendEmail)} onChange={e=>setSendEmail(e.target.value==='true')}><option value="false">Generate PDFs only</option><option value="true">Generate PDFs and email</option></select></label>
      </div>
      <details><summary>Create a new event</summary><div className="circulation-grid">{(['name','date_of_issue','certificate_type'] as const).map(field=><label key={field}>{field.replaceAll('_',' ')}<input type={field==='date_of_issue'?'date':'text'} value={newEvent[field]} onChange={e=>setNewEvent({...newEvent,[field]:e.target.value})}/></label>)}<button className="btn btn-secondary" disabled={busy} onClick={()=>run(async()=>{const data=EventSubmissionSchema.parse(newEvent);const result=await request<{event:EventChoice}>('/api/issuance/events',data);setEventId(result.event.id);await refresh();})}>Save event</button></div></details>
      <label className="circulation-upload">Recipient CSV · maximum 2 MB / 1,000 recipients<input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(!file)return;run(async()=>{if(file.size>2*1024*1024)throw new Error('CSV must be at most 2 MB.');const [head,...rows]=parseCsv(await file.text());const normalized=head.map(h=>h.trim().toLowerCase());setHeaders(normalized);setRawRows(rows);setRecipients([]);setMapping(Object.fromEntries(normalized.map(h=>[h,h])));});}}/></label>
      {headers.length>0 && <><div className="circulation-grid">{[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'recipient_key',label:'Recipient key (optional)'},...custom].map(field=><label key={field.key}>{field.label}<select value={mapping[field.key] || ''} onChange={e=>setMapping({...mapping,[field.key]:e.target.value})}><option value="">Not mapped</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label>)}</div><p>Other columns are retained as custom fields under their lowercase headers.</p><button className="btn btn-secondary" onClick={mapRows}>Build recipient preview</button></>}
    </section>
    {recipients.length>0 && <section className="circulation-panel"><h2>2. Review {recipients.length} recipients</h2><p>{errors.length ? `${errors.length} row errors. Correct or remove these rows.`:'All recipient rows are valid. Creating a draft will freeze the template and recipient values.'}</p>
      {errors.length>0 && <button className="btn btn-secondary" onClick={()=>setRecipients(recipients.filter((_,i)=>!errors.some(e=>e.row===i+1)))}>Remove invalid rows</button>}
      <div className="circulation-table"><table><thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Recipient key (optional)</th><th>Custom fields</th><th>Validation</th><th>Action</th></tr></thead><tbody>{recipients.map((row,i)=><tr key={i}><td>{i+1}</td>{(['name','email'] as const).map(field=><td key={field}><input aria-label={`Row ${i+1} ${field}`} value={row[field]} onChange={e=>setRecipients(recipients.map((r,j)=>j===i?{...r,[field]:e.target.value}:r))}/></td>)}<td><input aria-label={`Row ${i+1} recipient key`} value={row.recipient_key || ''} onChange={e=>setRecipients(recipients.map((r,j)=>j===i?{...r,recipient_key:e.target.value.trim() || undefined}:r))}/></td><td>{Object.entries(row.custom_fields || {}).map(([field,value])=><label key={field}>{field}<input aria-label={`Row ${i+1} ${field}`} value={value} onChange={e=>setRecipients(recipients.map((r,j)=>j===i?{...r,custom_fields:{...r.custom_fields,[field]:e.target.value}}:r))}/></label>)}</td><td>{errors.find(e=>e.row===i+1)?.message || 'Valid'}</td><td><button className="btn btn-secondary" onClick={()=>setRecipients(recipients.filter((_,j)=>j!==i))}>Remove</button></td></tr>)}</tbody></table></div>
      <button className="btn btn-primary" disabled={busy || errors.length>0 || !eventId || !templateId || !folderId} onClick={()=>run(async()=>{if(!key.current)key.current=crypto.randomUUID();const payload=BatchSubmissionSchema.parse({event_id:eventId,template_id:templateId,folder_id:folderId,send_email:sendEmail,idempotency_key:key.current,recipients});const result=await request<{batchId:string}>('/api/issuance/batches',payload);await openBatch(result.batchId);await refresh();setMessage('Draft saved. Review the frozen batch below, then approve processing.');})}>{busy?'Saving…':'Create frozen draft'}</button>
    </section>}
    <section className="circulation-panel"><h2>Saved batches</h2><p>Progress is saved on the server. You can close this page after approval and return later. {updated && `Last refreshed ${updated}.`}</p><div className="circulation-batches">{batches.map(batch=><button key={batch.id} className="btn btn-secondary" aria-pressed={detail?.batch.id===batch.id} onClick={()=>run(()=>openBatch(batch.id))}>{batch.id.slice(0,8)} · {batch.status} · {batch.send_email?'PDF + email':'PDF only'}</button>)}{batches.length===0 && <p>No saved batches.</p>}</div></section>
    {detail && <section className="circulation-panel"><h2>Batch {detail.batch.id.slice(0,8)} · {detail.batch.status}</h2><div className="circulation-actions">{(detail.batch.status==='draft'?['approve']:detail.batch.status==='paused'?['resume']:['queued','running'].includes(detail.batch.status)?['pause']:[]).map(action=><button key={action} className="btn btn-primary" disabled={busy} onClick={()=>run(async()=>{await request(`/api/issuance/batches/${detail.batch.id}`,{action});await refresh();})}>{action==='approve'?'Issue & Distribute':action==='pause'?'Pause new work':'Resume'}</button>)}<button className="btn btn-secondary" disabled={busy || !detail.summary.failed} onClick={()=>run(async()=>{await request(`/api/issuance/batches/${detail.batch.id}`,{action:'retry'});await refresh();})}>Retry failed items</button><a className="btn btn-secondary" href={`/api/issuance/batches/${detail.batch.id}/report`}>Download CSV report</a></div>
      <p>Pause stops new work; in-flight work may finish. Email acceptance does not confirm delivery. Ambiguous sends require operator review and are excluded from failed retry.</p>
      {(detail.attempts || []).filter(attempt=>['ambiguous','unknown'].includes(attempt.outcome)).map(attempt=>{
        const review=reconciliation[attempt.id] || {outcome:'',note:'',confirmed:false};
        const update=(change:Partial<typeof review>)=>setReconciliation({...reconciliation,[attempt.id]:{...review,...change}});
        const recipient=detail.items.find(item=>item.id===attempt.item_id);
        return <fieldset className="circulation-review" key={attempt.id}><legend>Review uncertain email: {recipient?.input.email || attempt.item_id}</legend>
          <p>Check provider logs or other reliable evidence before resolving this attempt. Marking accepted records provider acceptance only. Marking failed confirms the provider did not accept the email and permits a later manual retry.</p>
          <p>Attempt: {attempt.id}{attempt.provider_id ? ` · Provider reference: ${attempt.provider_id}`:''}{attempt.error ? ` · ${attempt.error}`:''}</p>
          <div className="circulation-grid"><label>Evidence-based outcome<select value={review.outcome} onChange={e=>update({outcome:e.target.value,confirmed:false})}><option value="">Choose an outcome</option><option value="accepted_by_provider">Provider accepted the email</option><option value="failed">Confirmed not accepted by provider</option></select></label><label>Evidence / operator note (at least 10 characters)<input value={review.note} maxLength={1000} onChange={e=>update({note:e.target.value,confirmed:false})}/></label></div>
          <label className="circulation-confirm"><input type="checkbox" checked={review.confirmed} onChange={e=>update({confirmed:e.target.checked})}/>I checked the evidence and confirm this outcome. No delivery confirmation is implied.</label>
          <button className="btn btn-secondary" disabled={busy || !review.confirmed || !review.outcome || review.note.trim().length<10} onClick={()=>run(async()=>{await request(`/api/issuance/batches/${detail.batch.id}`,{action:'reconcile',attempt_id:attempt.id,outcome:review.outcome,note:review.note.trim()});setReconciliation({...reconciliation,[attempt.id]:{outcome:'',note:'',confirmed:false}});await refresh();setMessage('Operator decision recorded. Confirmed failures can be retried using Retry failed items.');})}>Record operator decision</button>
        </fieldset>;
      })}
      <dl className="circulation-metrics">{Object.entries(detail.summary).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="circulation-grid"><label>Search recipients<input value={search} onChange={e=>setSearch(e.target.value)} type="search"/></label><label>Item state<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All states</option>{['queued','running','retry','completed','failed','review_required','suppressed'].map(state=><option key={state}>{state}</option>)}</select></label></div>
      <div className="circulation-table"><table><thead><tr><th>Recipient</th><th>Email</th><th>Stage</th><th>State</th><th>Attempts</th><th>Email outcome</th><th>Last error</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td>{item.input.name}{item.input.existing_certificate_id && <small> · Existing certificate will be reused</small>}</td><td>{item.input.email}</td><td>{item.stage}</td><td>{item.state==='review_required'?'Review required — possible email acceptance':item.state}</td><td>{item.attempt_count ?? 0}</td><td title={detail.attempts?.filter(a=>a.item_id===item.id).at(-1)?.provider_id}>{detail.attempts?.filter(a=>a.item_id===item.id).at(-1)?.outcome || (detail.batch.send_email?'Not attempted':'PDF only')}</td><td>{item.last_error || '—'}</td></tr>)}</tbody></table>{!visible.length && <p>No recipients match.</p>}</div>
    </section>}
  </div>;
}
