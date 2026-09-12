const Stripe=require('stripe');
const {db}=require('./_utils');
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method not allowed'};
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY||'');const sig=event.headers['stripe-signature'];const raw=event.isBase64Encoded?Buffer.from(event.body,'base64'):event.body;let ev;
  try{ev=stripe.webhooks.constructEvent(raw,sig,process.env.STRIPE_WEBHOOK_SECRET||'')}catch(e){return{statusCode:400,body:`Webhook Error: ${e.message}`}}
  const s=db();const session=ev.data.object;const orderId=session.metadata?.order_id||session.client_reference_id;if(!orderId)return{statusCode:200,body:'ok'};
  try{
    if(ev.type==='checkout.session.completed'||ev.type==='checkout.session.async_payment_succeeded'){
      if(ev.type==='checkout.session.completed'&&session.payment_status==='unpaid')return{statusCode:200,body:'waiting'};
      const shipping=session.collected_information?.shipping_details||session.shipping_details||null;const customer=session.customer_details||{};
      const {error}=await s.rpc('fulfill_order',{p_order_id:orderId,p_stripe_session_id:session.id,p_amount_total:session.amount_total||0,p_email:customer.email||null,p_phone:customer.phone||null,p_shipping_address:shipping?{name:shipping.name||null,address:shipping.address||null}:null});if(error)throw error;
    }
    if(ev.type==='checkout.session.expired'||ev.type==='checkout.session.async_payment_failed'){const {error}=await s.rpc('release_order',{p_order_id:orderId});if(error)throw error}
    return{statusCode:200,body:'ok'};
  }catch(e){console.error(e);return{statusCode:500,body:'Webhook processing failed'}}
};
