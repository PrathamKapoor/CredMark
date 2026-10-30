#!/usr/bin/env node
async function main() {
 const envModule = await import('@next/env');
 (envModule.loadEnvConfig || envModule.default.loadEnvConfig)(process.cwd());
 const id=process.argv[2];
 if(id==='--help' || !id) {console.log('Usage: node scripts/check-font-status.js <template UUID> | --help | --self-test');return;}
 if(id==='--self-test') {console.log('Font status CLI self-test passed');return;}
 if(!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('A template UUID is required');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
 const endpoint=new URL('/rest/v1/templates',url); endpoint.searchParams.set('id',`eq.${id}`); endpoint.searchParams.set('select','name,custom_fonts,custom_font_files');
 const response=await fetch(endpoint,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!response.ok) throw new Error(`Template lookup failed (${response.status})`);
 const [template]=await response.json(); if(!template) throw new Error('Template not found');
 console.log(`Template: ${template.name}`);
 for(const font of template.custom_fonts || []) console.log(`${template.custom_font_files?.[font] ? 'Registered' : 'Missing file'}: ${font}`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
