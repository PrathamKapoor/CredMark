import { z } from 'zod';
const realDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}, 'Choose a valid calendar date.');
export const EventSubmissionSchema = z.object({name:z.string().trim().min(1).max(120),date_of_issue:realDate,certificate_type:z.string().trim().min(1).max(120)}).strict();
export const RecipientSchema = z.object({
  name:z.string().trim().min(1).max(120),
  email:z.string().trim().toLowerCase().email().max(254),
  recipient_key:z.string().trim().min(1).max(254).optional(),
  custom_fields:z.record(z.string().min(1).max(100),z.string().max(500)).default({}),
}).strict();
export type RecipientInput = z.input<typeof RecipientSchema>;
export function validateRecipients(recipients: RecipientInput[]): {row:number;message:string}[] {
  const errors: {row:number;message:string}[] = []; const keys = new Set<string>(); const emails = new Set<string>();
  recipients.forEach((recipient,index) => {
    const result = RecipientSchema.safeParse(recipient);
    if (!result.success) { errors.push({row:index+1,message:result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}); return; }
    const key = result.data.recipient_key || result.data.email;
    if (keys.has(key) || emails.has(result.data.email)) errors.push({row:index+1,message:'Duplicate email or recipient key.'});
    keys.add(key); emails.add(result.data.email);
  });
  return errors;
}
export const BatchSubmissionSchema = z.object({
  event_id:z.string().uuid(),template_id:z.string().uuid(),folder_id:z.string().uuid(),send_email:z.boolean(),idempotency_key:z.string().uuid(),
  recipients:z.array(RecipientSchema).min(1).max(1000),
}).strict().superRefine((value,context) => {
  for (const error of validateRecipients(value.recipients)) context.addIssue({code:z.ZodIssueCode.custom,path:['recipients',error.row-1],message:error.message});
});
