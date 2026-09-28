import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {createHandler}=require('../netlify/functions/admin-shipping.js');
const S=require('../netlify/functions/_shippo.js');
const token='shippo_live_fake_test_credential';
const order={id:'order-1',status:'paid',fulfillment_method:'shipping',shipping_address:{name:'Recipient',address:{line1:'123 Main St',city:'Denver',state:'CO',postal_code:'80202',country:'US'}}};
const from={name:'Sender',street1:'456 Main St',city:'Denver',state:'CO',zip:'80202',country:'US'};
const parcel={length:16,width:12,height:6,weight:3};
const rate={id:'rate-1',carrier:'USPS',service:'Ground Advantage',amount:'8.50',currency:'USD',account:S.accountTag(token)};
function fixture(options={}) {
  let q={id:'quote-1',order_id:order.id,test:false,status:'quoted',rates:[rate]}, calls=[];
  const db={
    order:async()=>structuredClone(options.order||order),usage:async()=>options.used||0,
    quote:async()=>structuredClone(q),insert:async row=>(q={...q,...row}),
    async claim(id,rateId){if(options.claimError)throw Error(options.claimError);if(q.status!=='quoted')throw Error('Already claimed');q.status='purchasing';q.rate=q.rates.find(r=>r.id===rateId);return structuredClone(q);},
    async finish(id,tx,status){if(options.saveError)throw Error('Storage offline');Object.assign(q,{status,transaction_id:tx.object_id,label_url:tx.label_url,tracking_number:tx.tracking_number});return structuredClone(q);},
    async unknown(id,transaction_id){q.status='unknown';q.transaction_id=transaction_id;},list:async()=>[q]
  };
  const request=async(t,path,payload)=>{
    calls.push({path,payload});
    if(options.timeout)throw Error('Timeout');
    if(path==='shipments/')return {object_id:'shipment-1',rates:[{object_id:'rate-1',test:false,provider:'USPS',servicelevel:{name:'Ground Advantage'},currency:'USD',amount:'8.50'}]};
    return {object_id:'a'.repeat(32),metadata:S.metadata(q),test:q.test,rate:'rate-1',status:'SUCCESS',label_url:'https://example.com/label.pdf',tracking_number:'940000000000',...options.transaction};
  };
  const handler=createHandler({getStore:()=>db,getToken:()=>options.token??token,authorized:()=>options.authorized!==false,request});
  const call=async data=>{const r=await handler({httpMethod:data?'POST':'GET',headers:{},body:JSON.stringify(data)});return {status:r.statusCode,data:JSON.parse(r.body)};};
  const buy=()=>call({action:'buy',quote_id:q.id,rate_id:'rate-1',amount:'8.50',currency:'USD',confirm:true});
  return {call,buy,calls,get row(){return q;}};
}
test('admin authentication protects all shipping operations before configuration/database access',async()=>{
  const f=fixture({authorized:false});assert.equal((await f.buy()).status,401);assert.equal(f.calls.length,0);
});
test('unpaid, pickup and already tracked orders never request rates',async()=>{
  for(const change of [{status:'pending'},{fulfillment_method:'pickup'},{tracking_number:'existing'}]){
    const f=fixture({order:{...order,...change}});assert.equal((await f.call({action:'rates',order_id:order.id,from,parcel})).status,409);assert.equal(f.calls.length,0);
  }
});
test('rates validate parcel and address and stop at the cap',async()=>{
  for(const [options,box,sender] of [[{}, {...parcel,weight:0},from],[{},parcel,{...from,country:'CA'}],[{used:30},parcel,from]]){
    const f=fixture(options);assert.ok((await f.call({action:'rates',order_id:order.id,from:sender,parcel:box})).status>=400);assert.equal(f.calls.length,0);
  }
});
test('rate response excludes credential binding and buys nothing',async()=>{
  const f=fixture();const r=await f.call({action:'rates',order_id:order.id,from,parcel});assert.equal(r.status,200);assert.equal(r.data.rates[0].account,undefined);assert.equal(f.calls[0].path,'shipments/');assert.equal(f.calls.length,1);
});
test('altered prices, missing confirmation and changed mode are rejected before purchase',async()=>{
  const f=fixture();for(const change of [{amount:'0.01'},{confirm:false}]){assert.equal((await f.call({action:'buy',quote_id:'quote-1',rate_id:'rate-1',amount:'8.50',currency:'USD',confirm:true,...change})).status,change.confirm===false?400:409);}assert.equal(f.calls.length,0);
  const changed=fixture({token:'shippo_test_other'});assert.equal((await changed.buy()).status,409);
});
test('concurrent clicks purchase once and persist the label',async()=>{
  const f=fixture();const responses=await Promise.all([f.buy(),f.buy()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.calls.length,1);assert.equal(f.row.status,'success');assert.equal(f.row.tracking_number,'940000000000');
});
test('database cap/expired quote failure prevents any purchase request',async()=>{
  const f=fixture({claimError:'30-label cap reached'});assert.equal((await f.buy()).status,409);assert.equal(f.calls.length,0);
});
test('ambiguous timeout remains locked and cannot buy again',async()=>{
  const f=fixture({timeout:true});assert.equal((await f.buy()).status,202);assert.equal(f.row.status,'unknown');assert.equal((await f.buy()).status,409);assert.equal(f.calls.length,1);
});
test('failed save after purchase retains transaction ID for recovery',async()=>{
  const f=fixture({saveError:true});assert.equal((await f.buy()).status,202);assert.equal(f.row.transaction_id,'a'.repeat(32));assert.equal((await f.buy()).status,409);
});
test('pending responses are recoverable without a second purchase',async()=>{
  const f=fixture({transaction:{status:'WAITING',label_url:null,tracking_number:null}});assert.equal((await f.buy()).data.label.status,'pending');await f.call({action:'sync',quote_id:'quote-1'});assert.equal(f.calls.filter(c=>c.path==='transactions/').length,1);assert.match(f.calls[1].path,/transactions\/a{32}\//);
});
test('a transaction for another order or mode cannot be attached',async()=>{
  for(const transaction of [{metadata:'other-order'},{test:true},{rate:'other-rate'}]){const f=fixture({transaction});assert.equal((await f.buy()).status,202);assert.notEqual(f.row.status,'success');}
});
test('test carrier rates are never offered with a live key',()=>{
  assert.deepEqual(S.rateList({rates:[{object_id:'1',currency:'USD',amount:'9',test:true}]},'tag',false),[]);
});
test('practice orders require test mode even if marked paid, and ordinary unpaid orders remain blocked',()=>{
  const practice={...order,status:'pending',shipping_address:{...order.shipping_address,test_only:true}};
  assert.doesNotThrow(()=>S.eligible(practice,true));
  assert.throws(()=>S.eligible(practice,false),/test-only/);
  assert.throws(()=>S.eligible({...practice,status:'paid'},false),/test-only/);
  assert.throws(()=>S.eligible({...order,status:'pending'},true),/Only paid/);
});
