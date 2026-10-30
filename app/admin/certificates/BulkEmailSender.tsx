"use client";
import {useState,useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {Mail,Send,CheckCircle,XCircle} from 'lucide-react';
import type {Certificate} from '@/lib/types/database';
interface Summary {total:number;accepted:number;delivered:number;failed:number;ambiguous:number;pending:number;suppressed:number;completed:number}
export default function BulkEmailSender({certificates}:{certificates:Certificate[]}) {
 const router=useRouter();
 const [showModal,setShowModal]=useState(false);const [resendAll,setResendAll]=useState(false);
 const [submitting,setSubmitting]=useState(false);const [batchId,setBatchId]=useState<string|null>(null);
 const [summary,setSummary]=useState<Summary|null>(null);const [error,setError]=useState<string|null>(null);
 const requestKey=useRef<string|null>(null);
 const ready=certificates.filter(c=>c.is_valid&&(c.pdf_object_path||c.pdf_url)&&!c.email_sent);
 const eligible=resendAll?certificates.filter(c=>c.is_valid&&(c.pdf_object_path||c.pdf_url)):ready;
 useEffect(()=>{
  if(!batchId || !showModal)return;
  let disposed=false;
  const poll=async()=>{
   try {const response=await fetch(`/api/issuance/batches/${batchId}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to read batch progress');if(!disposed){setSummary(data.summary);setError(null);if(data.summary?.pending===0)router.refresh();}}
   catch(err){if(!disposed)setError(err instanceof Error?err.message:'Progress unavailable. The queued batch continues.');}
  };
  void poll();const timer=setInterval(()=>void poll(),3000);
  return()=>{disposed=true;clearInterval(timer);};
 },[batchId,showModal,router]);
 const open=()=>{setShowModal(true);const saved=localStorage.getItem('truemark.manualEmailBatch');if(saved)setBatchId(saved);};
 const enqueue=async()=>{
  setSubmitting(true);setError(null);requestKey.current??=crypto.randomUUID();
  try {
   const response=await fetch('/api/certificates/bulk-email',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey.current},body:JSON.stringify({certificateIds:eligible.map(c=>c.id),skipAlreadySent:!resendAll})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to queue emails');
   setBatchId(data.batchId);setSummary(null);localStorage.setItem('truemark.manualEmailBatch',data.batchId);requestKey.current=null;
  }catch(err){setError(err instanceof Error?err.message:'Unable to queue emails');}finally{setSubmitting(false);}
 };
 if(!certificates.length)return null;
 const finished=summary?.pending===0;
 return <>
  <button className="btn btn-secondary" onClick={open}><Mail size={16}/> Bulk Send Emails {ready.length>0&&<span className="badge">{ready.length}</span>}</button>
  {showModal&&<div className="success-overlay" onClick={()=>setShowModal(false)}><div className="confirm-dialog" style={{maxWidth:600,width:'95%'}} onClick={e=>e.stopPropagation()}>
   <h3 className="confirm-title"><Mail size={24}/> Bulk Send Emails</h3>
   {batchId?<>
    <p>{finished?'Batch processing finished.':'Emails queued. Progress is saved on the server.'}</p>
    <p>Closing this window leaves the batch running.</p>
    {summary&&<div className="verify-details-grid" aria-live="polite">
     <p>Total: {summary.total} · Pending: {summary.pending}</p>
     <p><CheckCircle size={14}/> Accepted: {summary.accepted} · Delivered: {summary.delivered}</p>
     <p><XCircle size={14}/> Failed: {summary.failed} · Review required: {summary.ambiguous}</p>
     <p>Suppressed: {summary.suppressed}</p>
    </div>}
    <a className="btn btn-secondary" href={`/admin/circulation?batch=${batchId}`}>Open circulation dashboard</a>
    {finished&&<button className="btn btn-ghost" onClick={()=>{setBatchId(null);setSummary(null);localStorage.removeItem('truemark.manualEmailBatch');}}>New batch</button>}
   </>:<>
    <p>{ready.length} ready · {certificates.filter(c=>c.email_sent).length} already accepted · {certificates.filter(c=>!c.pdf_url&&!c.pdf_object_path).length} without PDF</p>
    <label style={{display:'flex',gap:8,margin:'1rem 0'}}><input type="checkbox" checked={resendAll} onChange={e=>setResendAll(e.target.checked)}/> Resend previously accepted emails</label>
    <p>Queue {eligible.length} emails for background processing. Provider acceptance and delivery are reported separately.</p>
    <button className="btn btn-primary" disabled={submitting||!eligible.length} onClick={()=>void enqueue()}><Send size={16}/>{submitting?'Queuing…':'Queue emails'}</button>
   </>}
   {error&&<p className="error-text" role="alert">{error}</p>}
   <div className="confirm-actions"><button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Close</button></div>
  </div></div>}
 </>;
}
