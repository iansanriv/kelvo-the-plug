const {db,json,adminOK}=require('./_utils');
exports.handler=async(event)=>{
 if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});if(!adminOK(event))return json(401,{error:'Invalid admin key.'});
 try{const s=db();const {data,error}=await s.from('orders').select('id,status,amount_total,email,phone,shipping_address,fulfillment_method,stripe_session_id,created_at,paid_at,order_items(id,product_name,size,unit_price_cents,quantity)').order('created_at',{ascending:false}).limit(100);if(error)throw error;return json(200,{orders:data||[]})}catch(e){console.error(e);return json(500,{error:'Could not load orders.'})}
};
