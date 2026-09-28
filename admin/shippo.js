/* Loaded after the main admin script. */
const shipAPI = data => api('/api/admin-shipping', data ? {method:'POST',body:JSON.stringify(data)} : {});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let shippingConfig = {};
function shippingText(o) {
  const s=o.shipping_address||{},a=s.address||{};
  return [s.name,a.line1,a.line2,[a.city,a.state,a.postal_code].filter(Boolean).join(', '),a.country,o.email,o.phone].filter(Boolean).join('\n');
}
function shipButton(parent,text,action,acid=false) {
  const b=document.createElement('button');b.className=`btn${acid?' acid':''}`;b.textContent=text;
  b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){alert(e.message);}finally{b.disabled=false;}};
  parent.append(b);return b;
}
function shipLink(parent,text,url) {
  try{if(new URL(url).protocol!=='https:')return;}catch{return;}
  const a=document.createElement('a');a.className='btn';a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
}
function shipFields(parent,definitions,values={}) {
  const grid=document.createElement('div');grid.className='grid';parent.append(grid);const fields={};
  for(const [key,label,type] of definitions){
    const wrap=document.createElement('label'),caption=document.createElement('span');caption.className='label';caption.textContent=label;
    const input=document.createElement('input');input.className='field';input.type=type||'text';input.value=values[key]||'';
    if(type==='number'){input.min='0.01';input.step='0.01';}
    wrap.append(caption,input);grid.append(wrap);fields[key]=input;
  }
  return fields;
}
const fieldValues=fields=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]));
function openShippo(order) {
  const overlay=document.createElement('div');overlay.className='modal open';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Create shipping label');
  const dialog=document.createElement('div');dialog.className='dialog';overlay.append(dialog);
  dialog.innerHTML=`<div class="dialogHead"><h2>Create shipping label</h2></div><div class="notice">${shippingConfig.test?'TEST MODE — labels cannot be used for shipping.':'LIVE MODE — buying a label charges your Shippo account for postage.'}<br>One package per order · US states and DC · 4 × 6 inch PDF</div><h3>Deliver to</h3><pre style="white-space:pre-wrap"></pre><h3 style="margin:20px 0 12px">Return address</h3>`;
  dialog.querySelector('pre').textContent=shippingText(order);
  let busy=false;
  shipButton(dialog.querySelector('.dialogHead'),'Close',()=>{if(!busy)overlay.remove();});
  let saved={};try{saved=JSON.parse(localStorage.getItem('kelvoShipFrom')||'{}');}catch{}
  const from=shipFields(dialog,[['name','NAME / BUSINESS'],['street1','STREET ADDRESS'],['street2','APT / SUITE (OPTIONAL)'],['city','CITY'],['state','STATE (2 LETTERS)'],['zip','ZIP CODE'],['phone','PHONE'],['email','EMAIL']],saved);
  const note=document.createElement('p');note.className='sub';note.textContent='Return country: United States. This address is saved in this browser.';dialog.append(note);
  const heading=document.createElement('h3');heading.textContent='Packed box';heading.style.margin='22px 0 12px';dialog.append(heading);
  const box=shipFields(dialog,[['length','LENGTH (INCHES)','number'],['width','WIDTH (INCHES)','number'],['height','HEIGHT (INCHES)','number'],['weight','TOTAL WEIGHT (POUNDS)','number']]);
  const help=document.createElement('p');help.className='sub';help.textContent='Measure the outside shipping box and weigh it with shoes and packing material inside. Incorrect measurements can cause carrier adjustments.';dialog.append(help);
  const actions=document.createElement('div');actions.style.margin='18px 0';dialog.append(actions);
  const message=document.createElement('div');message.className='notice';message.hidden=true;message.setAttribute('role','status');dialog.append(message);
  const ratesBox=document.createElement('div');dialog.append(ratesBox);
  const inputs=[...Object.values(from),...Object.values(box)];
  const lock=value=>{busy=value;inputs.forEach(i=>i.disabled=value);};
  inputs.forEach(i=>i.addEventListener('input',()=>ratesBox.replaceChildren()));
  shipButton(actions,'GET SHIPPING RATES',async()=>{
    ratesBox.replaceChildren();message.hidden=false;message.textContent='Getting rates…';lock(true);
    try{
      const sender={...fieldValues(from),country:'US'};
      const quote=await shipAPI({action:'rates',order_id:order.id,from:sender,parcel:fieldValues(box)});
      localStorage.setItem('kelvoShipFrom',JSON.stringify(sender));
      message.textContent='Select a service. Postage is charged when you confirm Buy label. Rates expire after 15 minutes.';
      for(const rate of quote.rates){
        const row=document.createElement('div');row.className='order';
        const detail=document.createElement('p');detail.textContent=`${rate.carrier} · ${rate.service} · $${Number(rate.amount).toFixed(2)}${rate.days?' · estimated '+rate.days+' days':''}`;row.append(detail);
        shipButton(row,`${quote.test?'CREATE TEST LABEL':'BUY LABEL'} · $${Number(rate.amount).toFixed(2)}`,async()=>{
          if(busy)return;
          if(!confirm(quote.test?'Create a test label? It cannot be used to ship this package.':`Buy ${rate.carrier} ${rate.service} postage for $${Number(rate.amount).toFixed(2)} USD? This charges your Shippo account. Carrier adjustments or optional services may cost extra.`))return;
          lock(true);ratesBox.querySelectorAll('button').forEach(b=>b.disabled=true);actions.querySelector('button').disabled=true;
          try{
            const result=await shipAPI({action:'buy',quote_id:quote.quote_id,rate_id:rate.id,amount:rate.amount,currency:rate.currency,confirm:true});
            ratesBox.replaceChildren();message.textContent=result.uncertain?result.error:result.label.status==='success'?(quote.test?'Test label created. Do not use it to ship.':'Label purchased. Tracking saved. Mark shipped when you hand over the package.'):result.label.message||'Label processing. Close and refresh the label status.';
            if(result.label?.label_url)shipLink(ratesBox,quote.test?'OPEN TEST PDF':'OPEN / PRINT LABEL',result.label.label_url);
            await loadOrders();
          }catch(e){ratesBox.replaceChildren();message.textContent=e.message+' Refresh the order before attempting another purchase.';}
          finally{busy=false;}
        },true);ratesBox.append(row);
      }
    }catch(e){message.textContent=e.message;}finally{lock(false);}
  },true);
  document.body.append(overlay);from.name.focus();
}
async function refreshLabel(label) {
  let transaction_id=label.transaction_id;
  if(!transaction_id){transaction_id=prompt('The purchase response was interrupted. Check the label in Shippo, then paste its transaction ID here. Do not buy another label.');if(!transaction_id)return;}
  const d=await shipAPI({action:'sync',quote_id:label.id,transaction_id:transaction_id.trim()});
  if(d.label.status==='error')alert(d.label.message||'Shippo could not create the label. You can request new rates.');
  await loadOrders();
}
loadOrders = async function () {
  const b=document.getElementById('orderList');
  try{
    const [d,config]=await Promise.all([api('/.netlify/functions/admin-orders'),shipAPI().catch(e=>({error:e.message,labels:[]}))]);
    const orders=d.orders||[];shippingConfig=config;b.replaceChildren();
    const banner=document.createElement('div');banner.className='notice';
    banner.textContent=config.error?config.error:!config.configured?'Shippo setup: add SHIPPO_API_TOKEN as a Cloudflare runtime secret.':`${config.test?'Shippo TEST mode':'Shippo LIVE mode'} · ${config.used}/30 live labels used or reserved this UTC month. This cap counts this store only; purchases elsewhere in Shippo also count toward your account allowance. Postage is always paid.`;
    b.append(banner);
    for(const o of orders){
      const testOnly=o.shipping_address?.test_only===true;
      const e=document.createElement('div');e.className='order';
      e.innerHTML=`<div class="orderTop"><div><strong>Order ${esc(o.id.slice(0,8))}</strong><br><small>${esc(new Date(o.created_at).toLocaleString())} · ${esc(o.fulfillment_method)}</small></div><div><span class="status ${o.status==='paid'?'paid':''}">${esc(o.status)}</span><p>${money(o.amount_total)}</p>${o.shipped_at?'<strong>✓ SHIPPED</strong>':''}</div></div><pre style="white-space:pre-wrap;font:inherit;font-size:13px">${esc(shippingText(o))}</pre><div class="orderItems">${(o.order_items||[]).map(i=>`<p>${esc(i.quantity)} × ${esc(i.product_name)} — Size ${esc(i.size)} · ${money(i.unit_price_cents)}</p>`).join('')}</div>`;
      if(testOnly){
        e.querySelector('.status').textContent='TEST ORDER — NO PAYMENT';
        const info=document.createElement('p');info.className='notice';info.textContent='Shipping practice only. No payment or inventory changes. Real postage is blocked for this order.';e.append(info);
      }
      if((o.status==='paid'||(testOnly&&config.test))&&o.fulfillment_method==='shipping'){
        const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:16px 0';e.append(controls);
        const labels=(config.labels||[]).filter(l=>l.order_id===o.id&&l.test===config.test);
        const current=labels.find(l=>['success','purchasing','pending','unknown'].includes(l.status));
        if(current){
          const status=document.createElement('p');status.textContent=current.test?'TEST LABEL — not valid postage':`Shippo label: ${current.status}`;e.append(status);
          if(current.label_url)shipLink(controls,current.test?'OPEN TEST PDF':'OPEN / PRINT LABEL',current.label_url);
          if(current.status!=='success'){
            status.textContent+=' · '+(current.message||'Check status before doing anything else.');
            shipButton(controls,'CHECK LABEL STATUS',()=>refreshLabel(current));
          }
        }else if(config.configured&&!config.error&&!o.tracking_number&&!o.shipped_at){
          const button=shipButton(controls,config.test?'CREATE TEST LABEL':'CREATE SHIPPING LABEL',()=>openShippo(o),true);
          if(!config.test&&config.used>=30){button.disabled=true;button.textContent='30-LABEL CAP REACHED';}
        }
        if(!testOnly){
        shipButton(controls,'COPY ADDRESS',async()=>{await navigator.clipboard.writeText(shippingText(o));pop('Shipping info copied');});
        shipLink(controls,'OPEN PIRATE SHIP ↗','https://ship.pirateship.com/');
        const fields=shipFields(e,[['shipping_carrier','CARRIER'],['tracking_number','TRACKING NUMBER']],o);
        const updates=document.createElement('div');updates.style.cssText='display:flex;gap:8px;margin-top:12px';e.append(updates);
        const save=async shipped=>{const values=fieldValues(fields);if(shipped&&!values.tracking_number)throw Error('Enter a tracking number first.');await api('/.netlify/functions/admin-orders',{method:'PUT',body:JSON.stringify({id:o.id,...values,shipped})});await loadOrders();};
        shipButton(updates,'SAVE TRACKING',()=>save(false));
        if(!o.shipped_at)shipButton(updates,'MARK SHIPPED',()=>save(true),true);
        }
      }
      b.append(e);
    }
    if(!orders.length){const empty=document.createElement('p');empty.className='sub';empty.textContent='No orders yet.';b.append(empty);}
  }catch(e){b.textContent=e.message;}
};
document.getElementById('refreshOrders').onclick=loadOrders;
