function paypalBaseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let PAYPAL_SESSION = null;
let LAST_PAYPAL_ORDER_ID = null;


async function createPayPalOrder() {

  if (!CART.length) {
    throw new Error('Your cart is empty.');
  }

  const fulfillment =
    document.querySelector(
      'input[name=fulfillment]:checked'
    ).value;

  const response =
    await fetch(
      '/.netlify/functions/create-paypal-order',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          items: CART.map(i => ({
            variantId: i.variantId,
            quantity: i.quantity
          })),

          fulfillmentMethod:
            fulfillment
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
      'Could not start PayPal checkout.'
    );
  }

  LAST_PAYPAL_ORDER_ID = data.id;

  return {
    orderId: data.id
  };
}


async function capturePayPalOrder(orderId) {

  const response =
    await fetch(
      '/.netlify/functions/capture-paypal-order',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          orderId
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
      'PayPal payment failed.'
    );
  }

  return data;
}


async function loadPayPal() {

  const configResponse =
    await fetch(
      '/.netlify/functions/paypal-config',
      { cache: 'no-store' }
    );

  const config =
    await configResponse.json();

  if (!configResponse.ok) {
    throw new Error(
      config.error ||
      'PayPal unavailable.'
    );
  }


  const sdkUrl =
    config.environment === 'live'

      ? 'https://www.paypal.com/web-sdk/v6/core'

      : 'https://www.sandbox.paypal.com/web-sdk/v6/core';


  await new Promise((resolve, reject) => {

    const script =
      document.createElement('script');

    script.src = sdkUrl;
    script.async = true;

    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });


  const sdkInstance =
    await window.paypal.createInstance({
      clientId: config.clientId,

      components: [
        'paypal-payments'
      ],

      pageType: 'cart'
    });


  const eligibility =
    await sdkInstance.findEligibleMethods({
      currencyCode: 'USD'
    });


  if (!eligibility.isEligible('paypal')) {
    return;
  }


  PAYPAL_SESSION =
    await sdkInstance
      .createPayPalOneTimePaymentSession({

        async onApprove(data) {

          try {
            await capturePayPalOrder(
              data.orderId
            );

            CART = [];
            save();

            close();

            $('success').style.display =
              'block';

            $('success').textContent =
              '✓ PayPal payment completed. Your order is confirmed.';

            window.scrollTo({
              top: 0,
              behavior: 'smooth'
            });

            await loadProducts();

          } catch (error) {
            console.error(error);
            pop(error.message);
          }
        },


        onCancel() {
          pop(
            'PayPal checkout canceled — your cart is still here.'
          );
        },


        onError(error) {
          console.error(
            'PayPal error:',
            error
          );

          pop(
            'PayPal could not complete the payment.'
          );
        }
      });


  const button =
    document.createElement(
      'paypal-button'
    );

  document
    .getElementById(
      'paypal-button-container'
    )
    .appendChild(button);


  button.addEventListener(
    'click',

    async () => {

      if (!CART.length) {
        pop('Your cart is empty.');
        return;
      }

      try {

        // Important:
        // PayPal recommends not awaiting
        // this before starting the session.
        const orderPromise =
          createPayPalOrder();

        await PAYPAL_SESSION.start(
          {
            presentationMode: 'auto'
          },

          orderPromise
        );

      } catch (error) {
        console.error(error);
        pop(
          error.message ||
          'Could not open PayPal.'
        );
      }
    }
  );
}
async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error('Missing PayPal environment variables');
  }

  const auth = Buffer
    .from(`${clientId}:${secret}`)
    .toString('base64');

  const response = await fetch(
    `${paypalBaseUrl()}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type':
          'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('PayPal auth error:', data);
    throw new Error('Could not authenticate with PayPal');
  }

  return data.access_token;
}

async function paypalRequest(
  path,
  method = 'GET',
  payload = null,
  extraHeaders = {}
) {
  const token = await getAccessToken();

  const response = await fetch(
    `${paypalBaseUrl()}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...extraHeaders
      },
      body: payload
        ? JSON.stringify(payload)
        : undefined
    }
  );

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    console.error('PayPal API error:', data);

    throw new Error(
      data?.message ||
      'PayPal request failed'
    );
  }

  return data;
}

module.exports = {
  paypalRequest
};
