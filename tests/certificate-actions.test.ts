import {it,expect,vi} from 'vitest';
import {markEmailSent} from '@/app/actions/certificates';
vi.mock('@/lib/auth/admin',()=>({requireAdminOrThrow:async()=>({id:'admin'})}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>{
  const query={select:()=>query,eq:()=>query,in:()=>query,limit:()=>query,single:async()=>({data:{email:'asha@example.com'},error:null}),maybeSingle:async()=>({data:null,error:null})};
  return {from:()=>query};
}}));
it('cannot mark an email accepted without durable provider evidence',async()=>{
  expect((await markEmailSent('certificate')).success).toBe(false);
});
