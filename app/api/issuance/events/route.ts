import { NextRequest } from 'next/server';
import { authorize,endpoint,readJson } from '@/lib/issuance/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventSubmissionSchema } from '@/lib/issuance/validation';
export async function GET(request:NextRequest){return endpoint(async()=>{
  await authorize(request,'events:read');
  const {data,error}=await createAdminClient().from('events').select('*').order('date_of_issue',{ascending:false}).limit(1000);
  if(error)throw error;return {events:data};
});}
export async function POST(request:NextRequest){return endpoint(async()=>{
  await authorize(request,'events:write',true);
  const input=EventSubmissionSchema.parse(await readJson(request,16384));
  const {data,error}=await createAdminClient().from('events').insert(input).select().single();
  if(error)throw error;return {event:data};
},201);}
