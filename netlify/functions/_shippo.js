const { createHash } = require('crypto');
const { db } = require('./_utils');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function mode(token) {
  if (token?.startsWith('shippo_test_')) return true;
  if (token?.startsWith('shippo_live_')) return false;
  fail('Add a valid SHIPPO_API_TOKEN secret in Cloudflare to connect Shippo.', 503);
}
function address(input, label) {
  const a = {};
  for (const key of ['name', 'street1', 'street2', 'city', 'state', 'zip', 'country', 'phone', 'email']) {
    a[key] = String(input?.[key] || '').trim().slice(0, 200);
  }
  a.country = a.country.toUpperCase(); a.state = a.state.toUpperCase();
  for (const key of ['name', 'street1', 'city', 'state', 'zip', 'country']) {
    if (!a[key]) fail(`${label}: ${key} is required.`);
  }
  if (a.country !== 'US' || !/^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/.test(a.state)) {
    fail('This first version supports the 50 US states and DC. Use Shippo directly for other destinations and customs forms.');
  }
  return a;
}
function recipient(o) {
  const s = o.shipping_address || {}, a = s.address || {};
  return address({ name: s.name, street1: a.line1, street2: a.line2, city: a.city,
    state: a.state, zip: a.postal_code, country: a.country, phone: o.phone, email: o.email }, 'Delivery address');
}
function parcel(input) {
  const p = { distance_unit: 'in', mass_unit: 'lb' };
  for (const key of ['length','width','height','weight']) {
    const n = Number(input?.[key]);
    if (!Number.isFinite(n) || n <= 0 || n > (key === 'weight' ? 150 : 108)) fail(`Enter a valid package ${key} (${key === 'weight' ? 'pounds, up to 150' : 'inches, up to 108'}).`);
    p[key] = String(n);
  }
  return p;
}
function eligible(o, test = false) {
  if (!o) fail('Order not found.', 404);
  const fixture = o.shipping_address?.test_only === true;
  if (fixture && !test) fail('This is a test-only order. Use a Shippo test key; real postage is blocked.', 409);
  if ((o.status !== 'paid' && !(fixture && test)) || o.fulfillment_method !== 'shipping') fail('Only paid delivery orders can receive a label.', 409);
  if (o.shipped_at || o.tracking_number) fail('This order already has tracking or is shipped.', 409);
}
function safeURL(value) {
  try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
}
function messages(value) {
  return (value?.messages || []).map(m => String(m.text || m.message || '')).filter(Boolean).join(' ').slice(0, 800);
}
function metadata(row) { return `kelvo:${row.order_id}:${row.id}`; }
function accountTag(token) { return createHash('sha256').update(token).digest('hex').slice(0, 16); }
// Quotes are bound to the credential that created them (including live vs test).
function rateList(shipment, tag, test) {
  return (shipment.rates || []).filter(r => r.test === test && r.currency === 'USD' && Number(r.amount) > 0 && r.object_id)
    .map(r => ({ id: r.object_id, carrier: r.provider, service: r.servicelevel?.name || '',
      amount: r.amount, currency: r.currency, days: r.estimated_days, account: tag }))
    .sort((a,b) => Number(a.amount) - Number(b.amount));
}
async function shippoRequest(token, path, payload) {
  let response;
  try {
    response = await fetch(`https://api.goshippo.com/${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: { Authorization: `ShippoToken ${token}`, 'Content-Type': 'application/json', 'SHIPPO-API-VERSION': '2018-02-08' },
      ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(15000)
    });
  } catch { fail('Shippo did not respond. Check the label status before trying again.', 502); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    if (response.status === 401 || response.status === 403) fail('Shippo rejected the API key. Check its approval and the Cloudflare secret.', 502);
    fail(`Shippo could not complete the request (${response.status}). Check your Shippo account and shipping details.`, 502);
  }
  return data;
}
function store() {
  const s = db();
  async function run(query) { const {data,error} = await query; if (error) throw error; return data; }
  return {
    order: id => run(s.from('orders').select('*').eq('id',id).maybeSingle()),
    quote: id => run(s.from('shippo_labels').select('*').eq('id',id).maybeSingle()),
    insert: row => run(s.from('shippo_labels').insert(row).select('*').single()),
    claim: (id, rate) => run(s.rpc('claim_shippo_label', {p_id:id,p_rate_id:rate})),
    finish: (id, tx, state) => run(s.rpc('finish_shippo_label', {p_id:id,p_transaction_id:tx.object_id,
      p_status:state,p_label_url:safeURL(tx.label_url),p_tracking_number:tx.tracking_number || null,p_message:messages(tx) || null})),
    unknown: (id,transaction_id) => run(s.from('shippo_labels').update({status:'unknown',...(transaction_id ? {transaction_id} : {}),message:'Purchase result is uncertain. Check Shippo and recover the transaction; do not buy another label.'}).eq('id',id).eq('status','purchasing')),
    list: () => run(s.from('shippo_labels').select('id,order_id,test,status,rate,transaction_id,label_url,tracking_number,message,purchase_started_at').neq('status','quoted').order('created_at',{ascending:false}).limit(300)),
    async usage() {
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
      const { count, error } = await s.from('shippo_labels').select('id',{count:'exact',head:true}).eq('test',false)
        .or(`and(status.eq.success,purchase_started_at.gte.${start.toISOString()}),status.in.(purchasing,pending,unknown)`);
      if (error) throw error; return count;
    }
  };
}
module.exports = { fail, mode, address, recipient, parcel, eligible, safeURL, messages, metadata, accountTag, rateList, shippoRequest, store };
