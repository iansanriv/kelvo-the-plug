const {db,json}=require('./_utils');
exports.handler=async(event)=>{
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});
  try{
    const s=db();
    const {data,error}=await s.from('products').select('id,name,brand,description,condition,badge,image_url,active,created_at,product_variants(id,size,price_cents,stock,active)').eq('active',true).order('created_at',{ascending:false});
    if(error)throw error;
    return json(200,{products:(data||[]).map(p=>({...p,product_variants:(p.product_variants||[]).filter(v=>v.active).sort((a,b)=>String(a.size).localeCompare(String(b.size),undefined,{numeric:true}))}))},{'Cache-Control':'no-store'});
  }catch(e){console.error(e);return json(500,{error:'Could not load products.'})}
};
