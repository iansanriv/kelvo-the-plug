# Kelvo The Plug V3 — GitHub + Netlify + CMS

This version keeps the V2 look but makes the STORE CONTENT editable without touching HTML.

## What can be edited in the CMS
- Store name and location
- Top announcement
- Hero headings and description
- Instagram / WhatsApp / email links
- Button text
- Trust messages
- Inventory section text
- Why Kelvo section
- Bottom call-to-action
- Accent and background colors
- Sneaker name, brand, price, sizes, badge, condition, description
- Product photos
- Buy / checkout links
- Sold-out status

## Architecture
- `index.html` — storefront design. Styling stays embedded so it cannot disappear because of a missing CSS file.
- `data/site.json` — store-wide text, links, and colors.
- `data/products.json` — sneaker inventory.
- `media/` — uploaded product photos.
- `.pages.yml` — tells Pages CMS which fields to show.
- `admin/` — simple admin landing page that links to Pages CMS.
- `netlify.toml` — Netlify configuration.

## One-time setup

### 1. Create a GitHub repository
Create a repo such as `kelvo-the-plug`.

Upload ALL files and folders from this package to the repository root, including the hidden `.pages.yml` file.

### 2. Connect the GitHub repo to Netlify
In Netlify:
- Add a new project/site.
- Choose **Import an existing project**.
- Select **GitHub**.
- Pick the `kelvo-the-plug` repository.
- There is no build command.
- Publish directory: `.` (the repository root).
- Deploy.

From then on, every commit to the repo will automatically trigger a Netlify deployment.

### 3. Enable Pages CMS
Go to:
https://app.pagescms.org/

- Sign in with GitHub.
- Install/authorize the Pages CMS GitHub App when prompted.
- Give it access to the Kelvo repository.
- Open the repository.
- It will read `.pages.yml` and show **Store Settings** and **Sneaker Inventory**.

Pages CMS edits the files directly in GitHub. Because Netlify is connected to GitHub, each saved CMS change automatically republishes the website.

### 4. Give Kelvo editing access
The simplest approach:
- Add his GitHub account as a collaborator on the repository.
- He signs into Pages CMS with that GitHub account.
- He can then update products through forms without editing code.

## Everyday workflow for Kelvo
1. Open `YOUR-SITE.netlify.app/admin/`.
2. Tap **Open Store Editor**.
3. Sign into Pages CMS.
4. Open **Sneaker Inventory**.
5. Add/edit the shoe, sizes, price, picture, etc.
6. Save.
7. GitHub updates and Netlify republishes automatically.

Usually no manual Netlify upload is needed after the one-time setup.

## Before taking real orders
Replace:
- Demo product inventory and illustrations
- Instagram / WhatsApp / email
- Product purchase links
- Policies for authenticity, shipping, returns/exchanges and pickup

For checkout, `buyUrl` can point to a Stripe Payment Link, PayPal link, or another checkout URL. If it is left blank, the product button sends the customer to the store's primary contact link.

## Local preview
Because the storefront fetches JSON files, do not double-click `index.html`.
Run a local server, for example:
`python -m http.server 8000`
Then open `http://localhost:8000`.

