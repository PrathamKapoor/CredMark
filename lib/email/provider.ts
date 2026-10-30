import nodemailer from 'nodemailer';

export interface EmailMessage {to:string;subject:string;html:string;text:string;messageId:string}
export interface EmailResult {outcome:'accepted_by_provider'|'retryable'|'permanent'|'ambiguous';providerId?:string;error?:string}
export interface EmailProvider {name:string;send(message:EmailMessage):Promise<EmailResult>}
export function classifySmtpError(error:unknown):EmailResult {
  const detail=error&&typeof error==='object'?error as {responseCode?:number;code?:string;command?:string}:{};
  const response=detail.responseCode;
  if(response && response>=500) return {outcome:'permanent',error:`SMTP rejected (${response})`};
  if(response && response>=400 && response<500) return {outcome:'retryable',error:`SMTP temporarily rejected (${response})`};
  if(['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EAUTH'].includes(detail.code??'') && ['CONN','AUTH',undefined].includes(detail.command)) {
    return {outcome:detail.code==='EAUTH'?'permanent':'retryable',error:`SMTP pre-send failure (${detail.code})`};
  }
  return {outcome:'ambiguous',error:'SMTP outcome is unknown; review required before another send'};
}
function html(value:string):string {return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function makeCertificateMessage(certificate:{name:string;email:string;event_name:string;certificate_code:string},baseUrl:string):Omit<EmailMessage,'messageId'> {
  const verify=new URL(`/verify/${encodeURIComponent(certificate.certificate_code)}`,baseUrl).toString();
  const download=new URL(`/api/verify/${encodeURIComponent(certificate.certificate_code)}/pdf`,baseUrl).toString();
  const subject=`${certificate.event_name.replace(/[\r\n]/g,' ')} – Certificate`;
  return {to:certificate.email,subject,html:`<p>Dear ${html(certificate.name)},</p><p>Your certificate for ${html(certificate.event_name)} is ready.</p><p><a href="${html(download)}">Download certificate</a> · <a href="${html(verify)}">Verify certificate</a></p><p>Code: ${html(certificate.certificate_code)}</p>`,text:`Dear ${certificate.name},\nYour certificate for ${certificate.event_name} is ready.\nDownload: ${download}\nVerify: ${verify}\nCode: ${certificate.certificate_code}`};
}
export function createEmailProvider():EmailProvider {
  const name=process.env.EMAIL_PROVIDER??'disabled';
  if(name==='disabled') return {name:'disabled',async send(){return {outcome:'permanent',error:'Email delivery is disabled'};}};
  if(name==='capture') {
    if(process.env.NODE_ENV==='production') throw new Error('Capture provider is prohibited in production');
    return {name:'capture',async send(message){return {outcome:'accepted_by_provider',providerId:message.messageId};}};
  }
  if(process.env.NODE_ENV==='test') throw new Error('Real email providers are prohibited in tests');
  if(name!=='gmail') throw new Error('Unsupported EMAIL_PROVIDER');
  if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD) throw new Error('Gmail credentials are required');
  const transport=nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  return {name:'gmail',async send(message){
    try {
      const result=await transport.sendMail({...message,from:`"Certificate System" <${process.env.GMAIL_USER}>`});
      if(!result.accepted?.length) return {outcome:'permanent',error:'SMTP did not accept the recipient'};
      return {outcome:'accepted_by_provider',providerId:result.messageId};
    }catch(error){return classifySmtpError(error);}
  }};
}
