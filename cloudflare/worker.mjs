import products from '../netlify/functions/products.js';
import adminProducts from '../netlify/functions/admin-products.js';
import adminOrders from '../netlify/functions/admin-orders.js';
import adminShipping from '../netlify/functions/admin-shipping.js';
import adminUpload from '../netlify/functions/admin-upload.js';
import checkout from '../netlify/functions/create-checkout-session.js';
import webhook from '../netlify/functions/stripe-webhook.js';
import paypalConfig from '../netlify/functions/paypal-config.js';
import paypalCreate from '../netlify/functions/create-paypal-order.js';
import paypalCapture from '../netlify/functions/capture-paypal-order.js';
import { createWorker } from './adapter.mjs';

// Both route prefixes are handled here; the old paths do not contact Netlify.
export default createWorker({
  products: products.handler,
  'admin-products': adminProducts.handler,
  'admin-orders': adminOrders.handler,
  'admin-shipping': adminShipping.handler,
  'admin-upload': adminUpload.handler,
  'create-checkout-session': checkout.handler,
  'stripe-webhook': webhook.handler,
  'paypal-config': paypalConfig.handler,
  'create-paypal-order': paypalCreate.handler,
  'capture-paypal-order': paypalCapture.handler
});
