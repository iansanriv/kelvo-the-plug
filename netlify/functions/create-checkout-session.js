const Stripe=require('stripe');
const {db,json,body}=require('./_utils');
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  const req=body(event); if(!req||!Array.isArray(req.items)||!req.items.length)return json(400,{error:'Your cart is empty.'});
  const fulfillment=req.fulfillmentMethod==='pickup'?'pickup':'shipping';
  const requested=new Map();
  for(const i of req.items){const id=String(i.variantId||'');const q=Math.max(1,Math.min(10,Number(i.quantity)||1));if(!id)return json(400,{error:'Invalid cart item.'});requested.set(id,(requested.get(id)||0)+q)}
  const s=db();let orderId=null,reserved=false,stripeSessionId=null;
  try{
    const ids=[...requested.keys()];
    const {data:vars,error:ve}=await s.from('product_variants').select('id,size,price_cents,stock,active,products(id,name,brand,active)').in('id',ids);if(ve)throw ve;
    if(!vars||vars.length!==ids.length)return json(409,{error:'One or more items are no longer available.'});
    const orderItems=[];let subtotal=0;
    for(const v of vars){const q=requested.get(v.id),p=v.products;if(!v.active||!p||!p.active||v.stock<q)return json(409,{error:`${p?.name||'An item'} size ${v.size} no longer has enough stock.`});subtotal+=v.price_cents*q;orderItems.push({product_id:p.id,variant_id:v.id,product_name:p.name,size:v.size,unit_price_cents:v.price_cents,quantity:q})}
    const {data:o,error:oe}=await s.from('orders').insert({status:'pending',amount_total:subtotal,fulfillment_method:fulfillment,reserved:false}).select('id').single();if(oe)throw oe;orderId=o.id;
    const {error:ie}=await s.from('order_items').insert(orderItems.map(i=>({...i,order_id:orderId})));if(ie)throw ie;
    const {error:re}=await s.rpc('reserve_order',{p_order_id:orderId});if(re){await s.from('orders').update({status:'failed'}).eq('id',orderId);return json(409,{error:'One of those sizes just sold out. Refresh and try again.'})} reserved=true;
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY||'');
    const site=(process.env.URL||'').replace(/\/$/,''); if(!site)throw new Error('Netlify URL unavailable');
    const params={mode:'payment',line_items:vars.map(v=>({quantity:requested.get(v.id),price_data:{currency:'usd',unit_amount:v.price_cents,product_data:{name:`${v.products.name} — Size ${v.size}`,description:v.products.brand||undefined}}})),client_reference_id:orderId,metadata:{order_id:orderId,fulfillment_method:fulfillment},success_url:`${site}/?success=1&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${site}/?canceled=1`,expires_at:Math.floor(Date.now()/1000)+1800,phone_number_collection:{enabled:true},allow_promotion_codes:true};
    if(fulfillment==='shipping'){const cents=Math.max(0,Number(process.env.SHIPPING_CENTS||1200));params.shipping_address_collection={allowed_countries:['US']};params.shipping_options=[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:cents,currency:'usd'},display_name:'Standard shipping',delivery_estimate:{minimum:{unit:'business_day',value:3},maximum:{unit:'business_day',value:7}}}}]}
    if(String(process.env.STRIPE_AUTOMATIC_TAX||'').toLowerCase()==='true')params.automatic_tax={enabled:true};
    const session=await stripe.checkout.sessions.create(params); stripeSessionId=session.id;
    const {error:ue}=await s.from('orders').update({stripe_session_id:session.id}).eq('id',orderId);if(ue)throw ue;
    return json(200,{url:session.url});
  }catch(e){console.error(e);if(stripeSessionId){try{const stripe=new Stripe(process.env.STRIPE_SECRET_KEY||'');await stripe.checkout.sessions.expire(stripeSessionId)}catch{}}if(reserved&&orderId){try{await s.rpc('release_order',{p_order_id:orderId})}catch{}}return json(500,{error:'Checkout could not be started. Please try again.'})}
};
