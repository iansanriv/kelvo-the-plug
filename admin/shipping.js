function shippingText(o) {
  const s = o.shipping_address || {};
  const a = s.address || {};

  const lines = [
    s.name || '',
    a.line1 || '',
    a.line2 || '',
    [
      a.city,
      a.state,
      a.postal_code
    ].filter(Boolean).join(', '),
    a.country || '',
    o.email || '',
    o.phone || ''
  ];

  return lines.filter(Boolean).join('\n');
}


async function copyShippingInfo(orderId) {
  const d = await api('/.netlify/functions/admin-orders');
  const o = (d.orders || []).find(x => x.id === orderId);

  if (!o) {
    pop('Order not found');
    return;
  }

  const text = shippingText(o);

  try {
    await navigator.clipboard.writeText(text);
    pop('Shipping info copied');
  } catch {
    pop('Could not copy address');
  }
}


async function saveShipping(orderId, markShipped = false) {
  const tracking =
    document.getElementById(`tracking-${orderId}`).value.trim();

  const carrier =
    document.getElementById(`carrier-${orderId}`).value;

  if (markShipped && !tracking) {
    pop('Enter tracking number first');
    return;
  }

  try {
    await api('/.netlify/functions/admin-orders', {
      method: 'PUT',

      body: JSON.stringify({
        id: orderId,
        tracking_number: tracking,
        shipping_carrier: carrier,
        shipped: markShipped
      })
    });

    pop(
      markShipped
        ? 'Order marked as shipped'
        : 'Tracking saved'
    );

    await loadOrders();

  } catch (e) {
    pop(e.message);
  }
}


loadOrders = async function () {

  const d =
    await api('/.netlify/functions/admin-orders');

  const b =
    document.getElementById('orderList');

  b.innerHTML = '';

  (d.orders || []).forEach(o => {

    const shipping = o.shipping_address || {};
    const a = shipping.address || {};

    const address = [
      a.line1,
      a.line2,
      [a.city, a.state, a.postal_code]
        .filter(Boolean)
        .join(', ')
    ]
      .filter(Boolean)
      .join('<br>');

    const e =
      document.createElement('div');

    e.className = 'order';

    const shipped =
      !!o.shipped_at;

    e.innerHTML = `

      <div class="orderTop">

        <div>
          <strong>
            Order ${o.id.slice(0, 8)}
          </strong>

          <br>

          <small>
            ${new Date(o.created_at).toLocaleString()}
            ·
            ${o.fulfillment_method}
          </small>
        </div>


        <div style="text-align:right">

          <span class="status ${o.status}">
            ${o.status}
          </span>

          ${
            shipped
              ? `
                <div style="
                  margin-top:6px;
                  font-size:11px;
                  font-weight:900;
                  color:#d8ff3e
                ">
                  ✓ SHIPPED
                </div>
              `
              : ''
          }

          <div style="
            font-weight:900;
            margin-top:8px
          ">
            ${money(o.amount_total)}
          </div>

        </div>

      </div>


      <div style="
        margin-top:16px;
        line-height:1.5
      ">

        ${
          shipping.name
            ? `<strong>${shipping.name}</strong><br>`
            : ''
        }

        ${
          address
            ? `<div style="font-size:13px">${address}</div>`
            : '<small>No shipping address</small>'
        }

        <small style="
          display:block;
          margin-top:7px
        ">
          ${o.email || 'No email'}
          ${o.phone ? ' · ' + o.phone : ''}
        </small>

      </div>


      <div class="orderItems">

        ${(o.order_items || [])
          .map(i => `
            <div style="
              font-size:13px;
              margin:5px 0
            ">
              ${i.quantity}×
              ${i.product_name}
              — Size ${i.size}
              ·
              ${money(i.unit_price_cents)}
            </div>
          `)
          .join('')}

      </div>


      ${
        o.status === 'paid' &&
        o.fulfillment_method === 'shipping'

          ? `

          <div style="
            margin-top:16px;
            padding-top:16px;
            border-top:1px solid #292929
          ">

            <button
              class="btn"
              onclick="copyShippingInfo('${o.id}')"
              style="width:100%;margin-bottom:10px"
            >
              COPY SHIPPING INFO
            </button>


            <a
              class="btn"
              href="https://ship.pirateship.com/"
              target="_blank"
              style="
                display:block;
                text-align:center;
                text-decoration:none;
                margin-bottom:14px
              "
            >
              OPEN PIRATE SHIP ↗
            </a>


            <label class="label">
              CARRIER
            </label>

            <select
              class="field"
              id="carrier-${o.id}"
              style="margin-bottom:8px"
            >
              <option value="">
                Select carrier
              </option>

              <option
                value="USPS"
                ${o.shipping_carrier === 'USPS'
                  ? 'selected'
                  : ''}
              >
                USPS
              </option>

              <option
                value="UPS"
                ${o.shipping_carrier === 'UPS'
                  ? 'selected'
                  : ''}
              >
                UPS
              </option>
            </select>


            <label class="label">
              TRACKING NUMBER
            </label>

            <input
              class="field"
              id="tracking-${o.id}"
              value="${o.tracking_number || ''}"
              placeholder="Paste Pirate Ship tracking number"
            >


            <div style="
              display:flex;
              gap:8px;
              margin-top:10px
            ">

              <button
                class="btn"
                style="flex:1"
                onclick="
                  saveShipping('${o.id}', false)
                "
              >
                SAVE TRACKING
              </button>

              ${
                !shipped
                  ? `
                    <button
                      class="btn acid"
                      style="flex:1"
                      onclick="
                        saveShipping('${o.id}', true)
                      "
                    >
                      MARK SHIPPED
                    </button>
                  `
                  : `
                    <button
                      class="btn acid"
                      style="flex:1"
                      disabled
                    >
                      ✓ SHIPPED
                    </button>
                  `
              }

            </div>


            ${
              o.tracking_number
                ? `
                  <div style="
                    margin-top:10px;
                    font-size:12px;
                    color:#92928d
                  ">
                    ${o.shipping_carrier || ''}
                    ·
                    ${o.tracking_number}
                  </div>
                `
                : ''
            }

          </div>

          `

          : ''
      }

    `;

    b.appendChild(e);
  });


  if (!b.children.length) {
    b.innerHTML =
      '<div class="sub">No orders yet.</div>';
  }
};
