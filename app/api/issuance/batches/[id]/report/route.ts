import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize,endpoint } from '@/lib/issuance/http';
import { batchDetail } from '@/lib/issuance/service';
import { reportCsv } from '@/lib/issuance/domain';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    await authorize(request,'batches:read');
    const id=z.string().uuid().parse((await params).id),detail=await batchDetail(id);
    return new NextResponse(reportCsv(detail.items,detail.attempts),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="batch-${id}.csv"`,'Cache-Control':'private, no-store'}});
  }catch(error){return endpoint(async()=>{throw error;});}
}
