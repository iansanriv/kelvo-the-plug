// Local UI fixture, never contacts Shippo or Supabase. Login with any nonempty key.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const order={id:'00000000-0000-4000-8000-000000000001',status:'paid',amount_total:25000,created_at:new Date().toISOString(),fulfillment_method:'shipping',shipping_address:{name:'UI Test Recipient',address:{line1:'123 Example St',city:'Denver',state:'CO',postal_code:'80202',country:'US'}},email:'ui-test@example.com',order_items:[{quantity:1,product_name:'Test Sneakers',size:'9',unit_price_cents:25000}]};
let label;
createServer(async(req,res)=>{
  const respond=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.url==='/api/admin-shipping'){
    if(req.method==='GET')return respond({configured:true,test:true,used:0,limit:30,labels:label?[label]:[]});
    let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);
    if(data.action==='rates')return respond({quote_id:'test-quote',test:true,rates:[{id:'r1',carrier:'USPS',service:'Ground Advantage',amount:'8.50',currency:'USD',days:3},{id:'r2',carrier:'UPS',service:'Ground',amount:'10.10',currency:'USD',days:2}]});
    if(data.action==='buy'){label={id:'test-quote',order_id:order.id,test:true,status:'success',label_url:'https://example.com/test-label.pdf'};return respond({label});}
  }
  if(req.url==='/.netlify/functions/admin-products')return respond({products:[]});
  if(req.url==='/.netlify/functions/admin-orders')return respond({orders:[order]});
  const files={'/admin/':'admin/index.html','/admin/shippo.js':'admin/shippo.js'};
  if(!files[req.url])return respond({error:'Fixture route not found'},404);
  res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':'text/html'});res.end(await readFile(new URL('../'+files[req.url],import.meta.url)));
}).listen(8789,'127.0.0.1',()=>console.log('Admin fixture: http://127.0.0.1:8789/admin/ (no external calls)'));
