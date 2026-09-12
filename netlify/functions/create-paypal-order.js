const { db, json, body } = require('./_utils');
const { paypalRequest } = require('./_paypal');

const dollars = cents =>
  (Number(cents || 0) / 100).toFixed(2);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'Method not allowed'
    });
  }

  const req = body(event);

  if (
    !req ||
    !Array.isArray(req.items) ||
    !req.items.length
  ) {
    return json(400, {
      error: 'Your cart is empty.'
    });
  }

  const fulfillment =
    req.fulfillmentMethod === 'pickup'
      ? 'pickup'
      : 'shipping';

  const requested = new Map();

  for (const item of req.items) {
    const id = String(item.variantId || '');

    const quantity = Math.max(
      1,
      Math.min(10, Number(item.quantity) || 1)
    );

    if (!id) {
      return json(400, {
        error: 'Invalid cart item.'
      });
    }

    requested.set(
      id,
      (requested.get(id) || 0) + quantity
    );
  }

  const s = db();

  let storeOrderId = null;
  let reserved = false;

  try {
    const ids = [...requested.keys()];

    const { data: variants, error } =
      await s
        .from('product_variants')
        .select(`
          id,
          size,
          price_cents,
          stock,
          reserved_stock,
          active,
          products(
            id,
            name,
            brand,
            active
          )
        `)
        .in('id', ids);

    if (error) throw error;

    if (!variants || variants.length !== ids.length) {
      return json(409, {
        error:
          'One or more items are no longer available.'
      });
    }

    let subtotal = 0;
    let pairCount = 0;

    const orderItems = [];

    for (const v of variants) {
      const quantity = requested.get(v.id);
      const product = v.products;

      const available =
        Number(v.stock || 0) -
        Number(v.reserved_stock || 0);

      if (
        !v.active ||
        !product ||
        !product.active ||
        available < quantity
      ) {
        return json(409, {
          error:
            `${product?.name || 'An item'} ` +
            `size ${v.size} no longer has enough stock.`
        });
      }

      subtotal +=
        v.price_cents * quantity;

      pairCount += quantity;

      orderItems.push({
        product_id: product.id,
        variant_id: v.id,
        product_name: product.name,
        size: v.size,
        unit_price_cents: v.price_cents,
        quantity
      });
    }

    let shipping = 0;

    if (fulfillment === 'shipping') {
      const baseShipping = Math.max(
        0,
        Number(
          process.env.SHIPPING_BASE_CENTS || 1200
        )
      );

      const additional = Math.max(
        0,
        Number(
          process.env
            .SHIPPING_ADDITIONAL_PAIR_CENTS ||
          500
        )
      );

      shipping =
        baseShipping +
        Math.max(0, pairCount - 1) * additional;
    }

    const total = subtotal + shipping;

    const { data: order, error: orderError } =
      await s
        .from('orders')
        .insert({
          status: 'pending',
          amount_total: total,
          fulfillment_method: fulfillment,
          reserved: false,
          payment_processor: 'paypal'
        })
        .select('id')
        .single();

    if (orderError) throw orderError;

    storeOrderId = order.id;

    const { error: itemError } =
      await s
        .from('order_items')
        .insert(
          orderItems.map(item => ({
            ...item,
            order_id: storeOrderId
          }))
        );

    if (itemError) throw itemError;

    const { error: reserveError } =
      await s.rpc('reserve_order', {
        p_order_id: storeOrderId
      });

    if (reserveError) {
      await s
        .from('orders')
        .update({ status: 'failed' })
        .eq('id', storeOrderId);

      return json(409, {
        error:
          'One of those sizes just sold out. Refresh and try again.'
      });
    }

    reserved = true;

    const paypalItems =
      variants.map(v => ({
        name: `${v.products.name} — Size ${v.size}`,
        quantity:
          String(requested.get(v.id)),
        unit_amount: {
          currency_code: 'USD',
          value: dollars(v.price_cents)
        },
        category: 'PHYSICAL_GOODS'
      }));

    const paypalOrder =
      await paypalRequest(
        '/v2/checkout/orders',
        'POST',
        {
          intent: 'CAPTURE',

          purchase_units: [{
            reference_id: storeOrderId,
            custom_id: storeOrderId,

            items: paypalItems,

            amount: {
              currency_code: 'USD',
              value: dollars(total),

              breakdown: {
                item_total: {
                  currency_code: 'USD',
                  value: dollars(subtotal)
                },

                shipping: {
                  currency_code: 'USD',
                  value: dollars(shipping)
                }
              }
            }
          }],

          payment_source: {
            paypal: {
              experience_context: {
                brand_name: 'Kelvo The Plug',
                user_action: 'PAY_NOW',

                shipping_preference:
                  fulfillment === 'shipping'
                    ? 'GET_FROM_FILE'
                    : 'NO_SHIPPING'
              }
            }
          }
        },

        {
          'PayPal-Request-Id':
            `create-${storeOrderId}`
        }
      );

    await s
      .from('orders')
      .update({
        paypal_order_id: paypalOrder.id
      })
      .eq('id', storeOrderId);

    return json(200, {
      id: paypalOrder.id,
      storeOrderId
    });

  } catch (error) {
    console.error(error);

    if (reserved && storeOrderId) {
      try {
        await s.rpc('release_order', {
          p_order_id: storeOrderId
        });
      } catch {}
    }

    return json(500, {
      error:
        'PayPal checkout could not be started.'
    });
  }
};
