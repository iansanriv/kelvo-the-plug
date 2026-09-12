# Kelvo The Plug V4 — Cart + Stripe Checkout + Orders + Live Inventory

V4 turns the V3 catalog into a small real e-commerce store.

## Customer experience
- Browse live inventory
- Open a sneaker and select a size
- Add one or more pairs to a cart
- Choose shipping or Tampa local pickup
- Pay on Stripe-hosted Checkout
- Customer email/phone are collected by Stripe
- Shipping address is collected for shipped orders
- Stock is reserved for 30 minutes when Checkout starts
- Paid orders stay deducted from inventory
- If the Checkout Session expires or a delayed payment fails, reserved stock is returned

## Kelvo's admin experience
Open `https://YOUR-SITE.netlify.app/admin/` and enter the private `ADMIN_KEY`.

From the dashboard Kelvo can:
- Add a sneaker
- Upload a product photo from phone/computer
- Add multiple sizes
- Set a separate price and stock count per size
- Edit existing inventory
- Hide products
- View paid/pending/expired orders

Product/inventory changes are live immediately. They do not need a Netlify redeploy.

Pages CMS remains in use for **Store Settings** (store text, links, colors, hero copy, etc.). Inventory is no longer stored in Pages CMS because automatic stock deduction requires a live database.

---

# One-time setup

## 1) Upload V4 to the existing GitHub repo
Upload/replace the files from this package in the root of the `kelvo-the-plug` repository.

Important new files/folders:
- `package.json`
- `netlify/functions/`
- `supabase/schema.sql`
- updated `index.html`
- updated `admin/index.html`
- updated `.pages.yml`
- updated `netlify.toml`

Commit to `main`. Since Netlify is connected to GitHub, it should start a deployment automatically.

## 2) Create a Supabase project
Create a Supabase project.

Then open **SQL Editor**, create a query, paste the ENTIRE contents of:

`supabase/schema.sql`

and run it once.

That creates:
- `products`
- `product_variants`
- `orders`
- `order_items`
- atomic inventory reservation/release functions
- public `product-images` storage bucket
- two demo sneakers for testing

## 3) Get Supabase server credentials
From your Supabase project, get:
- Project URL
- server secret / `service_role` key

The service-role/server secret is sensitive. Never place it in HTML, Pages CMS, or GitHub.

## 4) Configure Stripe
Create or use Kelvo's Stripe account.

Start in **test mode**.

Get the Stripe secret test key (`sk_test_...`). Do not use a live key until the full order flow is tested.

## 5) Add Netlify environment variables
In the Netlify project, add these variables with Functions access:

`SUPABASE_URL`
= Supabase project URL

`SUPABASE_SERVICE_ROLE_KEY`
= Supabase server secret/service-role key

`STRIPE_SECRET_KEY`
= Stripe secret key (test key first)

`ADMIN_KEY`
= a long private password for `/admin/` (24+ random characters recommended)

`SHIPPING_CENTS`
= flat shipping charge in cents, e.g. `1200` = $12.00

Optional:

`STRIPE_AUTOMATIC_TAX=true`

Only enable automatic tax after Stripe Tax/business tax settings are properly configured.

After adding/changing environment variables, redeploy the Netlify site.

## 6) Add the Stripe webhook
After Netlify deploys V4, the webhook URL is:

`https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook`

Create a Stripe webhook/event destination pointing to that URL and subscribe to:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Stripe gives you a webhook signing secret beginning with `whsec_...`.

Add it to Netlify as:

`STRIPE_WEBHOOK_SECRET`

Then redeploy once more.

## 7) Test before live sales
Use Stripe test mode and complete an end-to-end test order.

Verify:
1. A customer can select a size and add it to cart.
2. Checkout opens on Stripe.
3. `/admin/` shows the order after payment.
4. The purchased size's stock decreases.
5. A checkout that expires returns reserved inventory.
6. Shipping and pickup work as expected.
7. Product photo upload works from `/admin/`.

After that, replace the demo inventory and photos.

## 8) Going live
Before switching Stripe to live mode, Kelvo should finalize:
- real inventory/photos/prices
- Instagram/WhatsApp/email
- shipping charge and shipping policy
- Tampa pickup procedure
- return/exchange policy
- authenticity policy
- sales-tax configuration/obligations
- Stripe business verification

Then replace the Stripe test secret with the live secret and create a LIVE-mode webhook endpoint/signing secret as well.

---

# How an order works technically

1. Customer chooses a size.
2. Store sends only the variant ID + quantity to the server.
3. Server reads the real price and stock from Supabase (the browser cannot choose its own price).
4. Database atomically reserves the requested stock.
5. A Stripe Checkout Session is created with a 30-minute expiration.
6. Customer pays on Stripe.
7. Stripe sends a signed webhook to Netlify.
8. Netlify verifies the Stripe signature and marks the order paid.
9. Kelvo sees it in `/admin/`.
10. If Checkout expires instead, the webhook returns the reserved stock.

This design keeps Stripe secrets and the Supabase service-role key on the server, not in browser code.
