const { json, body, adminOK } = require('./_utils');
const S = require('./_shippo');

function createHandler({getStore = S.store, request = S.shippoRequest, getToken = () => process.env.SHIPPO_API_TOKEN, authorized = adminOK} = {}) {
  return async event => {
    if (!['GET','POST'].includes(event.httpMethod)) return json(405,{error:'Method not allowed'});
    if (!authorized(event)) return json(401,{error:'Invalid admin key.'});
    try {
      const token = getToken();
      if (event.httpMethod === 'GET' && !token) return json(200,{configured:false,labels:[],used:0,limit:30});
      const test = S.mode(token), tag = S.accountTag(token), db = getStore();
      if (event.httpMethod === 'GET') {
        const [labels,used] = await Promise.all([db.list(),db.usage()]);
        return json(200,{configured:true,test,labels,used,limit:30});
      }
      const req = body(event);
      if (!req || !['rates','buy','sync'].includes(req.action)) S.fail('Invalid shipping request.');
      if (req.action === 'rates') {
        const order = await db.order(req.order_id); S.eligible(order);
        if (!test && await db.usage() >= 30) S.fail('30-label store cap reached. Use Pirate Ship for additional labels.',409);
        const from = S.address(req.from,'Return address'), to = S.recipient(order), box = S.parcel(req.parcel);
        const shipment = await request(token,'shipments/',{address_from:from,address_to:to,parcels:[box],async:false});
        const rates = S.rateList(shipment,tag,test);
        if (!shipment.object_id || !rates.length) S.fail(S.messages(shipment) || 'No shipping rates returned. Check both addresses, package details and enabled carriers in Shippo.',422);
        const quote = await db.insert({order_id:order.id,test,shipment_id:shipment.object_id,shipping_address:order.shipping_address,rates});
        return json(200,{quote_id:quote.id,test,rates:rates.map(({account,...r})=>r)});
      }
      const q = await db.quote(req.quote_id);
      if (!q) S.fail('Shipping quote not found.',404);
      if (q.test !== test || q.rates?.[0]?.account !== tag) S.fail('The Shippo key changed. Switch back to the original key to recover a purchase, or get a new quote.',409);
      const finish = async tx => {
        const rateID = typeof tx.rate === 'string' ? tx.rate : tx.rate?.object_id;
        if (!tx.object_id || tx.metadata !== S.metadata(q) || rateID !== q.rate.id || tx.test !== q.test) {
          S.fail('Shippo transaction does not match this order and mode. Check the transaction ID.',409);
        }
        const state = tx.status === 'SUCCESS' && S.safeURL(tx.label_url) && tx.tracking_number ? 'success' : tx.status === 'ERROR' ? 'error' : 'pending';
        const label = await db.finish(q.id,tx,state);
        return json(200,{label});
      };
      if (req.action === 'sync') {
        if (!['purchasing','pending','unknown','success'].includes(q.status)) S.fail('No purchase to recover.',409);
        const id = q.transaction_id || req.transaction_id;
        if (!/^[a-f0-9]{32}$/i.test(id || '')) S.fail('Copy this label’s transaction ID from Shippo to recover it. Do not purchase another label.');
        return await finish(await request(token,`transactions/${id}/`));
      }
      if (req.confirm !== true) S.fail('Confirm the postage purchase first.');
      const selected = q.rates.find(r => r.id === req.rate_id);
      if (!selected || req.amount !== selected.amount || req.currency !== selected.currency) S.fail('The selected price changed. Get rates again.',409);
      // The database claim is atomic and enforces payment, address, quota and duplicate checks.
      let claimed;
      try { claimed = await db.claim(q.id,req.rate_id); }
      catch (e) { S.fail(e.message || 'Could not reserve this label.',409); }
      q.rate = claimed.rate;
      let tx;
      try {
        tx = await request(token,'transactions/',{rate:q.rate.id,label_file_type:'PDF_4x6',metadata:S.metadata(q),async:false});
        return await finish(tx);
      } catch {
        // Never retry a purchase after a timeout or a failed database save.
        const txID = tx?.metadata === S.metadata(q) && /^[a-f0-9]{32}$/i.test(tx.object_id || '') ? tx.object_id : null;
        await db.unknown(q.id,txID).catch(()=>{});
        return json(202,{uncertain:true,error:'The purchase result is uncertain. Refresh the order and check Shippo before buying another label.'});
      }
    } catch (e) {
      return json(e.status || 500,{error:e.status ? e.message : 'Shipping storage is unavailable. Check that the shipping database setup is installed.'});
    }
  };
}
exports.createHandler = createHandler;
exports.handler = createHandler();
