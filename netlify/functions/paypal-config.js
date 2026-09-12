const { json } = require('./_utils');

exports.handler = async () => {
  const clientId =
    process.env.PAYPAL_CLIENT_ID;

  if (!clientId) {
    return json(500, {
      error: 'PayPal is not configured.'
    });
  }

  return json(200, {
    clientId,

    environment:
      process.env.PAYPAL_ENVIRONMENT === 'live'
        ? 'live'
        : 'sandbox'
  });
};
