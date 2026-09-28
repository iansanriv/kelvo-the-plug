import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import Stripe from 'stripe';
import assert from 'node:assert/strict';

// Uses fake credentials only. No database writes or payment API requests.
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  modules: true,
  scriptPath: '.wrangler/check/worker.js',
  compatibilityDate: '2026-09-27',
  compatibilityFlags: ['nodejs_compat'],
  bindings: {
    ADMIN_KEY: 'local-test-key-only',
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'local-placeholder',
    PAYPAL_CLIENT_ID: 'local-paypal-client',
    PAYPAL_ENVIRONMENT: 'sandbox'
  }
}] }));
try {
  for (const path of ['admin-products', 'admin-orders', 'admin-upload', 'admin-shipping']) {
    const response = await mf.dispatchFetch(`https://store.example/api/${path}`, {
      method: path === 'admin-upload' ? 'POST' : 'GET',
      headers: { 'x-admin-key': 'incorrect' }
    });
    assert.equal(response.status, 401, path);
  }
  for (const path of ['create-checkout-session', 'create-paypal-order', 'capture-paypal-order']) {
    const response = await mf.dispatchFetch(`https://store.example/.netlify/functions/${path}`, {
      method: 'POST', body: '{}'
    });
    assert.equal(response.status, 400, path);
  }
  const config = await mf.dispatchFetch('https://store.example/api/paypal-config');
  assert.equal(config.status, 200);
  assert.equal((await config.json()).clientId, 'local-paypal-client');
  const invalid = await mf.dispatchFetch('https://store.example/api/stripe-webhook', { method: 'POST', body: '{}' });
  assert.equal(invalid.status, 400);
  const payload = JSON.stringify({ type: 'unrelated.test', data: { object: {} } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_placeholder' });
  const signed = await mf.dispatchFetch('https://store.example/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': signature }, body: payload
  });
  assert.equal(signed.status, 200, await signed.text());
  console.log('Runtime smoke checks passed: admin auth, input validation, PayPal config, Stripe signature verification.');
} finally {
  await mf.dispose();
}
