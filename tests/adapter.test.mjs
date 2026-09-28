import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../cloudflare/adapter.mjs';

test('both API prefixes preserve method, headers, URL and signed webhook body', async () => {
  const raw = '{ "amount": 100, "label": "sneaker — size 9" }\n';
  const worker = createWorker({ 'stripe-webhook': async event => {
    assert.equal(event.body, raw);
    assert.equal(event.headers['stripe-signature'], 'test-signature');
    assert.equal(event.httpMethod, 'POST');
    assert.equal(event.isBase64Encoded, false);
    assert.equal(new URL(event.rawUrl).origin, 'https://store.workers.dev');
    return { statusCode: 200, body: 'ok' };
  } });
  for (const prefix of ['/api/', '/.netlify/functions/']) {
    const response = await worker.fetch(new Request(`https://store.workers.dev${prefix}stripe-webhook`, {
      method: 'POST', headers: { 'Stripe-Signature': 'test-signature' }, body: raw
    }), {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('unlisted routes and inherited object names cannot invoke functions', async () => {
  const worker = createWorker({});
  for (const path of ['_utils', 'constructor', '__proto__', 'admin-products/extra']) {
    assert.equal((await worker.fetch(new Request(`https://store.workers.dev/api/${path}`), {})).status, 404);
  }
});

test('static files use the asset binding; backend failures do not expose secrets', async () => {
  const worker = createWorker({ fail: async () => { throw Error('private-secret'); } });
  const response = await worker.fetch(new Request('https://store.workers.dev/admin/'), {
    ASSETS: { fetch: async () => new Response('admin page') }
  });
  assert.equal(await response.text(), 'admin page');
  const failure = await worker.fetch(new Request('https://store.workers.dev/api/fail'), {});
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes('private-secret'), false);
});
