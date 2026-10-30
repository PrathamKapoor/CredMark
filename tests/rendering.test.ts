import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import { PDFDocument,PDFArray,PDFName,PDFDict,PDFString } from 'pdf-lib';
import { generateCertificatePdf } from '../lib/pdf/generate-certificate';
import type { Certificate, Template } from '../lib/types/database';
vi.mock('../lib/supabase/admin',()=>({createAdminClient:()=>{throw new Error('Network forbidden')}}));
describe('offline rendering',()=>{
 it('renders WebP and italic deterministically without external I/O',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
   const imageBytes=await sharp({create:{width:640,height:480,channels:3,background:'#ffffff'}}).webp().toBuffer();
   const certificate={certificate_code:'ABCDEFGH2345',name:'Test Recipient',event_name:'Offline Event',date_of_issue:'2026-01-01',created_at:'2026-01-01T00:00:00Z'} as Certificate;
   const template={name:'Test',image_url:'https://blocked.invalid/image.webp',image_width:640,image_height:480,name_x:320,name_y:200,name_font_size:32,name_font_family:'serif',name_alignment:'center',name_italic:true,event_x:null,event_y:null,date_x:null,date_y:null,link_x:320,link_y:350,link_width:300,link_height:30,link_font_family:'sans-serif',link_font_size:10,link_alignment:'center'} as Template;
   const args={certificate,template,imageBytes,strictFonts:true,baseUrl:'https://example.test'};
   const first=await generateCertificatePdf(args);const second=await generateCertificatePdf(args);
   expect(Buffer.from(first.pdfBytes).equals(Buffer.from(second.pdfBytes))).toBe(true);
   const pdf=await PDFDocument.load(first.pdfBytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getCreationDate()?.toISOString()).toBe(certificate.created_at.replace('Z','.000Z'));
   const annotations=pdf.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray);
   const action=annotations.lookup(0,PDFDict).lookup(PDFName.of('A'),PDFDict);
   expect(action.lookup(PDFName.of('URI'),PDFString).decodeText()).toBe('https://example.test/verify/ABCDEFGH2345');
   expect(first.fileName).toBe('offline-event/ABCDEFGH2345.pdf');
   expect(fetchMock).not.toHaveBeenCalled();
   const customTemplate={...template,name_font_family:'Owned Custom',custom_font_files:{'Owned Custom':'https://blocked.invalid/font.ttf'}};
   await expect(generateCertificatePdf({...args,template:customTemplate})).rejects.toThrow('Frozen font bytes missing');
   const fontBytes={'Owned Custom':new Uint8Array(readFileSync('node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'))};
   const custom=await generateCertificatePdf({...args,template:customTemplate,fontBytes});
   expect((await PDFDocument.load(custom.pdfBytes)).getPageCount()).toBe(1);
   expect(fetchMock).not.toHaveBeenCalled();
  } finally {fetchMock.mockRestore();}
 });
});
