const {db,json,body,adminOK}=require('./_utils');
exports.handler=async(event)=>{
  if(!['GET','POST','PUT','DELETE'].includes(event.httpMethod))return json(405,{error:'Method not allowed'});
  if(!adminOK(event))return json(401,{error:'Invalid admin key.'});
  const s=db();
  try{
    if(event.httpMethod==='GET'){
      const {data,error}=await s.from('products').select('id,name,brand,description,condition,badge,image_url,active,created_at,product_variants(id,size,price_cents,stock,active)').order('created_at',{ascending:false});if(error)throw error;return json(200,{products:data||[]});
    }
    const req=body(event);if(!req)return json(400,{error:'Invalid JSON.'});
    if(event.httpMethod==='DELETE'){
      if(!req.id)return json(400,{error:'Product id required.'});
      await s.from('product_variants').update({active:false}).eq('product_id',req.id);
      const {error}=await s.from('products').update({active:false}).eq('id',req.id);if(error)throw error;return json(200,{ok:true});
    }
    const p=req.product||{};if(!p.name||!p.brand||!p.image_url||!Array.isArray(p.variants)||!p.variants.length)return json(400,{error:'Name, brand, image, and at least one size are required.'});
    let id=p.id;
    if(!id){const {data,error}=await s.from('products').insert({name:p.name,brand:p.brand,description:p.description||'',condition:p.condition||'New / Deadstock',badge:p.badge||'',image_url:p.image_url,active:p.active!==false}).select('id').single();if(error)throw error;id=data.id}
    else{const {error}=await s.from('products').update({name:p.name,brand:p.brand,description:p.description||'',condition:p.condition||'New / Deadstock',badge:p.badge||'',image_url:p.image_url,active:p.active!==false}).eq('id',id);if(error)throw error}
    const incoming=p.variants.filter(v=>v.id).map(v=>v.id);
    const {data:existing,error:xe}=await s.from('product_variants').select('id').eq('product_id',id);if(xe)throw xe;
    const disable=(existing||[]).map(v=>v.id).filter(x=>!incoming.includes(x));if(disable.length){const {error}=await s.from('product_variants').update({active:false}).in('id',disable);if(error)throw error}
    for(const v of p.variants){const row={product_id:id,size:String(v.size||'').trim(),price_cents:Math.round(Number(v.price_cents)||0),stock:Math.max(0,Math.round(Number(v.stock)||0)),active:v.active!==false};if(!row.size||row.price_cents<=0)return json(400,{error:'Every size needs a size and price.'});if(v.id){const {error}=await s.from('product_variants').update(row).eq('id',v.id);if(error)throw error}else{const {error}=await s.from('product_variants').insert(row);if(error)throw error}}
    return json(200,{ok:true,id});
  }catch(e){console.error(e);return json(500,{error:e.message||'Could not update product.'})}
};
