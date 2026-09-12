function paypalBaseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
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
