const { db, json, body, adminOK } = require('./_utils');

exports.handler = async (event) => {
  if (!['GET', 'PUT'].includes(event.httpMethod)) {
    return json(405, { error: 'Method not allowed' });
  }

  if (!adminOK(event)) {
    return json(401, { error: 'Invalid admin key.' });
  }

  const s = db();

  try {

    // LOAD ORDERS
    if (event.httpMethod === 'GET') {
      const { data, error } = await s
        .from('orders')
        .select(`
          id,
          status,
          amount_total,
          email,
          phone,
          shipping_address,
          fulfillment_method,
          stripe_session_id,
          tracking_number,
          shipping_carrier,
          shipped_at,
          created_at,
          paid_at,
          order_items(
            id,
            product_name,
            size,
            unit_price_cents,
            quantity
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return json(200, {
        orders: data || []
      });
    }


    // UPDATE SHIPPING / TRACKING
    const req = body(event);

    if (!req || !req.id) {
      return json(400, {
        error: 'Order id required.'
      });
    }

    const trackingNumber =
      String(req.tracking_number || '').trim();

    const carrier =
      String(req.shipping_carrier || '').trim();

    const shipped = req.shipped === true;

    if (shipped && !trackingNumber) {
      return json(400, {
        error: 'Enter a tracking number before marking as shipped.'
      });
    }

    const updates = {
      tracking_number: trackingNumber || null,
      shipping_carrier: carrier || null,
      shipped_at: shipped
        ? new Date().toISOString()
        : null
    };

    const { data, error } = await s
      .from('orders')
      .update(updates)
      .eq('id', req.id)
      .eq('status', 'paid')
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json(409, {
        error: 'Only paid orders can be marked as shipped.'
      });
    }

    return json(200, {
      ok: true
    });

  } catch (e) {
    console.error(e);

    return json(500, {
      error: e.message || 'Could not update order.'
    });
  }
};