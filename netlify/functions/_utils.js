const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
function db(){
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment variables');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function json(statusCode,body,headers={}){return{statusCode,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}}
function body(event){try{return JSON.parse(event.body||'{}')}catch{return null}}
function adminOK(event){const a=String(event.headers['x-admin-key']||'');const b=String(process.env.ADMIN_KEY||'');if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
module.exports={db,json,body,adminOK};
