const { db, json, body } =
  require('./_utils');

const { paypalRequest } =
  require('./_paypal');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'Method not allowed'
    });
  }

  const req = body(event);

  const paypalOrderId =
    String(req?.orderId || '');

  if (!paypalOrderId) {
    return json(400, {
      error: 'PayPal order id required.'
    });
  }

  const s = db();

  try {
    const { data: order, error } =
      await s
        .from('orders')
        .select(`
          id,
          status,
          amount_total,
          paypal_order_id
        `)
        .eq('paypal_order_id', paypalOrderId)
        .single();

    if (error) throw error;

    if (order.status === 'paid') {
      return json(200, {
        ok: true,
        alreadyPaid: true
      });
    }

    const result =
      await paypalRequest(
        `/v2/checkout/orders/${paypalOrderId}/capture`,
        'POST',
        {},
        {
          'PayPal-Request-Id':
            `capture-${paypalOrderId}`
        }
      );

    if (result.status !== 'COMPLETED') {
      throw new Error(
        `PayPal status: ${result.status}`
      );
    }

    const unit =
      result.purchase_units?.[0];

    const capture =
      unit?.payments?.captures?.[0];

    const paidCents =
      Math.round(
        Number(capture?.amount?.value || 0) *
        100
      );

    if (paidCents !== order.amount_total) {
      throw new Error(
        'PayPal amount does not match order total.'
      );
    }

    const paypal =
      result.payment_source?.paypal || {};

    const shipping =
      unit?.shipping || null;

    const normalizedShipping =
      shipping
        ? {
            name:
              shipping.name?.full_name ||
              null,

            address: {
              line1:
                shipping.address
                  ?.address_line_1 ||
                null,

              line2:
                shipping.address
                  ?.address_line_2 ||
                null,

              city:
                shipping.address
                  ?.admin_area_2 ||
                null,

              state:
                shipping.address
                  ?.admin_area_1 ||
                null,

              postal_code:
                shipping.address
                  ?.postal_code ||
                null,

              country:
                shipping.address
                  ?.country_code ||
                null
            }
          }
        : null;

    const { error: fulfillError } =
      await s.rpc(
        'fulfill_paypal_order',
        {
          p_order_id: order.id,
          p_paypal_order_id:
            paypalOrderId,
          p_paypal_capture_id:
            capture?.id || null,
          p_amount_total:
            paidCents,
          p_email:
            paypal.email_address ||
            result.payer?.email_address ||
            null,
          p_phone: null,
          p_shipping_address:
            normalizedShipping
        }
      );

    if (fulfillError) {
      throw fulfillError;
    }

    return json(200, {
      ok: true,
      status: 'COMPLETED',
      captureId: capture?.id || null
    });

  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        'PayPal payment could not be completed.'
    });
  }
};
