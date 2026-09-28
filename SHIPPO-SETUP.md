# Shippo setup

The admin now supports **get rates → choose service → confirm postage purchase → print a 4×6 PDF**. Tracking is saved automatically for a live label. Mark shipped separately when handing over the package.

## Account and Cloudflare

1. Create a Shippo account on the **API Starter** plan. Add your postage payment method and enable the carriers you want in Shippo.
2. In Shippo **Settings → API** (or API Portal → Developer keys), obtain your token. Live API access may require approval. Save it privately; do not commit it or paste it in chat.
3. In Cloudflare Workers → kelvo-the-plug → Settings → Runtime variables and secrets, add a **Secret** named `SHIPPO_API_TOKEN`. Save/deploy the setting.
4. A `shippo_test_...` key produces test labels. A `shippo_live_...` key purchases real postage when you confirm **Buy label**. Never ship a package using a test PDF.
5. Deploy this branch. The database migration `supabase/migrations/20260928065038_shippo_shipping.sql` installs the private shipping journal and purchase guards. It was applied to the Kelvo project during setup; do not rerun the old full-store schema.

## Use

Open Admin → Orders → a **paid shipping order** → **Create shipping label**. Enter your real return address and the packed box's dimensions in inches and total weight in pounds. The return address is remembered in that browser. Get rates, choose a service, review the charge, and confirm Buy label. Open the PDF and print at actual size on 4×6 stock (or a standard sheet without shrinking the label).

The first version supports a single parcel within the 50 US states and DC. International/territory/military shipments, customs, additional insurance, returns and refunds are handled in Shippo directly. Do not assume extra insurance is included. Carrier adjustments for wrong weight/dimensions remain payable.

## 30-label cap

The store stops before a 31st live label in a UTC calendar month. Successful labels plus unresolved attempts count; unresolved attempts from earlier months remain reserved until reconciled. Test labels do not count. The database enforces this across simultaneous clicks and worker instances. Refunds do not reopen a slot automatically.

This counter covers **this store only**, not labels bought in Shippo's dashboard or other integrations. Use a dedicated account to keep counts aligned, and check Shippo's billing period and plan allowance. The account's first 30 API labels per month have no label-generation fee; postage is separate. Additional account services can have fees. The cap is not a guarantee of zero account charges.

At the cap, the admin retains Copy address / Open Pirate Ship / manual tracking. Switching shipping services does not require moving the website.

## Interrupted purchases

Never automatically retry a label purchase. If the carrier call times out, the order stays locked to avoid duplicate postage. Use **Check label status**; if no transaction ID was saved, retrieve that ID from Shippo and enter it. The server validates the transaction's order metadata, rate and test/live mode. If Shippo has no matching transaction, an operator must confirm no charge/label exists before releasing the journal entry. A new API key invalidates unused quotes; keep the original key available until outstanding purchases are reconciled.

## Validation

`npm test` covers auth, paid delivery restrictions, rate validation, changed prices/modes, concurrent clicks, pending transactions, timeouts, storage failures and recovery checks. `npm run test:runtime` bundles and checks the Cloudflare worker. `tests/shippo-database.sql` checks actual database permissions and purchase guards in a rollback transaction; run against an isolated environment or an account with zero shipping usage.

No real postage purchase was made during installation. Verify a test-key label end to end before relying on live purchases. Live postage purchases require your explicit Buy label confirmation in the admin.

Sources: https://goshippo.com/pricing/api · https://support.goshippo.com/hc/en-us/articles/360026412791-Managing-Your-API-Tokens-in-Shippo · https://docs.goshippo.com/guides/generate-shipping-label
