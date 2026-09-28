# Move Kelvo to Cloudflare Workers

This migration starts from the current `iansanriv/kelvo-the-plug` GitHub repository, including PayPal and shipping/tracking controls. It keeps the existing Supabase database and images. Do not re-run the old `supabase/schema.sql`: it predates the newer reservation, PayPal, and tracking fields used by the live code.

## 1. Account and source

Sign into https://dash.cloudflare.com/ and use Workers Free. Resume the existing Supabase project. Keep the existing Netlify deployment until the replacement passes testing.

Use the `cloudflare-migration` branch of `iansanriv/kelvo-the-plug` once it has been pushed. The original `main` branch does not have the Cloudflare configuration yet.

## 2. Deploy from GitHub

In Cloudflare, open **Workers & Pages**, create an application, and choose the option to import/connect a GitHub repository. Authorize access to the Kelvo repository.

- Repository: `iansanriv/kelvo-the-plug`
- Production branch: `cloudflare-migration`
- Worker name: `kelvo-the-plug` (must match `wrangler.jsonc`)
- Root directory: repository root
- Build command: leave blank; Wrangler runs `npm run build` from its configuration
- Deploy command: `npx wrangler deploy`
- Use the Free plan; no database or paid Cloudflare products need to be provisioned

The first deployment can show the pages before secrets exist, but inventory and checkout will not work until the next step. The public URL will be shown by Cloudflare, normally `https://kelvo-the-plug.<your-subdomain>.workers.dev`. A purchased domain is optional. The old `netlify.app` address cannot transfer to Cloudflare.

## 3. Configure the Worker's runtime settings

Open the Worker → **Settings → Variables and Secrets**. These belong to the running Worker, not just the build environment. Save/deploy the configuration after adding values. Do not paste secret values into GitHub or chat.

| Name | Type | Value/source |
| --- | --- | --- |
| `ADMIN_KEY` | Secret | A new strong password you save privately; Kelvo uses this for `/admin/` |
| `SUPABASE_URL` | Text | Existing Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Existing Supabase server key, not the public anonymous key |
| `STRIPE_SECRET_KEY` | Secret | Stripe test key for testing; live key only at launch |
| `STRIPE_WEBHOOK_SECRET` | Secret | Signing secret for the new Cloudflare Stripe webhook destination |
| `PAYPAL_CLIENT_ID` | Text | PayPal app client ID matching the selected environment |
| `PAYPAL_CLIENT_SECRET` | Secret | Matching PayPal app secret |
| `PAYPAL_ENVIRONMENT` | Text | `sandbox` for testing; `live` at launch |
| `SHIPPING_BASE_CENTS` | Text | Existing shipping charge for one pair; code defaults to `1200` ($12) |
| `SHIPPING_ADDITIONAL_PAIR_CENTS` | Text | Existing extra-pair charge; code defaults to `500` ($5) |
| `STRIPE_AUTOMATIC_TAX` | Text | Preserve your existing setting; omitted means disabled |
| `SITE_URL` | Text, optional | Final canonical HTTPS storefront URL, without a trailing slash; otherwise checkout uses the request origin |

Do not copy Netlify's automatic `URL` variable: that would send customers back to the old site after payment. Existing credentials may be copied from Netlify if revealable or retrieved from the original provider. This migration does not retrieve or rotate credentials automatically.

## 4. Payment destination

In Stripe, create a webhook destination for:

`https://YOUR-CLOUDFLARE-HOST/api/stripe-webhook`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Save its signing secret as `STRIPE_WEBHOOK_SECRET`. Test and live destinations have different secrets.

The current PayPal code captures payments through `/api/capture-paypal-order` (the old `/.netlify/functions/` paths are also served by Cloudflare). No PayPal webhook handler exists in the repository. Verify any PayPal app domain restrictions against the new address.

Keep the old Stripe destination available for checkouts started on Netlify until they finish/expire. Do not replace a webhook signing secret with the old destination's secret.

## 5. Verify before sharing the new address

Test inventory load, correct and incorrect admin passwords, a photo upload, product edits, tracking controls, Stripe test checkout and PayPal sandbox checkout, shipping and pickup totals, stock reservations, paid-order recording, and release of abandoned reservations. Test payments against a separate test database or clearly controlled test inventory so they do not affect real stock.

The repository's newer code expects `reserved_stock`, PayPal fields, tracking columns, and `fulfill_paypal_order` in the existing database. Those later SQL changes are not captured in its old schema file; a fresh database from that file is insufficient. The migration preserves existing order logic, and does not claim to repair or verify all pre-existing payment behavior. PayPal abandoned-order release in particular needs verification against the existing database/scheduled jobs.

Local adapter tests, a Wrangler dry build, and local Worker runtime checks are provided. Live payment behavior and the Free plan's CPU limit still need validation before launch.

## Local commands

Use Node.js 22 or newer and run:

```text
npm ci
npm test
npm run check:deploy
npm run test:runtime
```

For local manual testing, put credentials in an ignored `.dev.vars` file and run `npm run dev`. For direct deployment from this checkout, run `npx wrangler login`, then `npm run deploy`.

## Sources

- https://developers.cloudflare.com/workers/static-assets/migration-guides/netlify-to-workers/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
