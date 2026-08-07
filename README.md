<div align="center">

# OpenVend

**Self-hosted store CMS for digital goods — with a storefront you can make your own.**

[🌐 OpenVend Website](https://openvend.space) • [🌐 OpenVend Example](https://example.openvend.space) • [💬 Contact](#hosting--custom-work)

![GitHub stars](https://img.shields.io/github/stars/Barkie12/OpenVend?style=flat&logo=github)
![Last commit](https://img.shields.io/github/last-commit/Barkie12/OpenVend)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-one--command-2496ED?logo=docker&logoColor=white)
![Stripe](https://img.shields.io/badge/Cards-Stripe-635BFF?logo=stripe&logoColor=white)
![NOWPayments](https://img.shields.io/badge/Crypto-NOWPayments-F7931A?logo=bitcoin&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

An open alternative to hosted platforms like SellAuth and Sellix: **no platform fees, no ban risk, and your customer data stays yours.**

The idea is simple — this project gives you the **entire store backend as a CMS**: products, variants, stock pools, orders, delivery, coupons, payments, fraud controls, analytics, and a full admin panel. A clean storefront template ships on top of it. Use the template as-is, restyle it, or **rip it out and build your own frontend** — the backend doesn't care what the store looks like.

## How it's put together

| Layer | What it does | Where it lives |
| --- | --- | --- |
| **Admin panel (the CMS)** | Dashboard, products, stock, orders, coupons, blacklist, analytics, settings | `src/app/admin/` |
| **Backend** | Checkout, payments, webhooks, delivery, auth, file serving | `src/app/api/`, `src/lib/` |
| **Storefront template** | Product grid, product pages, checkout, order/receipt page | `src/app/(storefront)/`, `src/app/checkout/`, `src/components/storefront/` |

Everything the storefront renders comes from typed functions in `src/lib/` (`products.ts`, `orders.ts`, `coupons.ts`, …) and server actions — so a custom frontend is mostly a matter of swapping the components in the storefront layer and keeping the imports.

## Features

**Selling**

- **Instant delivery** — serial keys are consumed per sale, files become tokenized download links, services deliver your instructions the moment payment confirms; any product can carry file attachments
- **Variants & groups** — price tiers ("1 month / lifetime") with per-variant stock pools, compare-at pricing, quantity bounds; group products into storefront sections
- **Guest checkout** — buyers pay with just an e-mail and get a private, unguessable order link; no buyer accounts
- **Coupons** — percentage or fixed, quick-generate codes, start/end dates, global and per-customer usage limits, minimum order value, per-product scoping, plus per-coupon revenue/savings stats
- **SEO** — per-product meta titles/descriptions, JSON-LD product markup, sitemap, robots, dynamic favicon from your uploaded logo

**Payments (your accounts, your money)**

- **Stripe** — cards, Apple Pay, Google Pay in an **embedded on-site modal** (no redirect)
- **NOWPayments** — on-site crypto checkout: buyers pick from 200+ coins, get a deposit address + QR + exact amount, and the page tracks confirmation live; IPN webhooks with a polling fallback so it even works on localhost
- **PayPal Friends & Family** — zero-fee manual method: buyers see your PayPal address with F&F/no-note instructions, stock is held 24h, and you confirm each payment with one click (**Mark paid & deliver**)
- Signed webhooks on both automated providers, amount/currency cross-checks before delivery, idempotent finalization — forged or replayed payment events don't deliver goods

**Running the shop**

- **Admin dashboard** — revenue/order charts, best sellers, top spenders, payment method breakdowns, live visitor count
- **First-party analytics** — pageviews, visitors, sessions, referrers, UTM, device/browser/country breakdowns; privacy-friendly (salted daily-rotating visitor hash, raw IPs never stored); optional GA4 on top
- **Fraud controls** — e-mail/domain/IP/country blacklists with one-click blacklisting from any order, layered rate limits, optional Cloudflare Turnstile
- **Safety rails** — stock reserved 30 minutes per checkout and auto-released; underpaid crypto and late payments land in **Needs review** instead of silently failing
- **Notifications** — delivery e-mails via **SMTP, Resend, or Brevo**; sale alerts via Discord webhook
- **Owner security** — e-mail/password login with optional TOTP two-factor; secrets encrypted at rest (AES-256-GCM)

## Quick start (Docker)

```bash
git clone https://github.com/Barkie12/OpenVend.git openvend
cd openvend
cp .env.example .env
# edit .env: set APP_SECRET (openssl rand -base64 32) and APP_URL
docker compose up -d --build
```

Open `http://localhost:3000/setup`, create your shop and owner account, and you're live. Add products in the admin panel, connect payment providers under **Settings → Payments**, and share your storefront.

## Quick start (Node, no Docker)

All you need is [Node.js](https://nodejs.org) 20+ and a Postgres database — a local install or a free hosted one ([Neon](https://neon.tech), [Supabase](https://supabase.com)) both work. On Windows, run these in PowerShell:

```powershell
git clone https://github.com/Barkie12/OpenVend.git openvend
cd openvend
npm install
Copy-Item .env.example .env
# generate a secret (no openssl needed):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# edit .env: paste it as APP_SECRET, and point DATABASE_URL at your Postgres
npm run build
npm run start
```

On macOS/Linux the same steps apply — just use `cp .env.example .env` instead of `Copy-Item`. Database migrations run automatically when the server boots, so there's nothing else to set up: open `http://localhost:3000/setup` and create your shop.

## Payment provider setup

### Stripe (cards, Apple Pay, Google Pay)

1. Grab your **secret key** (`sk_…`) and **publishable key** (`pk_…`) from the [Stripe dashboard](https://dashboard.stripe.com/apikeys). The publishable key enables the embedded on-site payment modal; without it, buyers get Stripe's hosted page instead.
2. Create a webhook endpoint pointing to `https://your-domain.com/api/webhooks/stripe` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Copy its **signing secret** (`whsec_…`).
3. Paste everything under **Settings → Payments**, flip the switch, save.

For local development, forward webhooks with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
```

### NOWPayments (crypto)

1. Create an API key in your [NOWPayments dashboard](https://account.nowpayments.io/) and generate an **IPN secret** under Payment Settings.
2. Set the IPN callback URL to `https://your-domain.com/api/webhooks/nowpayments`.
3. Paste the API key and IPN secret under **Settings → Payments**, enable, save.

Buyers pick a coin at checkout and pay a deposit address rendered on their order page — no redirect. Payment status updates come from the IPN webhook, with an API polling fallback that keeps orders moving even when the callback URL isn't publicly reachable (e.g. local development). Underpaid orders land in **Needs review** where you approve or cancel them.

### PayPal Friends & Family (manual)

Enter your PayPal e-mail under **Settings → Payments** and flip the switch — that's the whole setup. Buyers get your address with instructions (send as Friends & Family, no note, exact amount), their stock is reserved for 24 hours, and the order delivers the moment you press **Mark paid & deliver** on it. No API, no fees, no automation — check incoming payments carefully before approving.

## Customizing the storefront

The template is intentionally thin. To make the store yours:

- **Restyle** — theme tokens (colors, radii, fonts) live in `src/app/globals.css` (Tailwind CSS v4 + shadcn/ui variables); swap the palette and you've reskinned the whole store
- **Rearrange** — page layouts are in `src/app/(storefront)/` (home, product page, order page) and `src/app/checkout/`; the building blocks are in `src/components/storefront/`
- **Replace** — build entirely new pages against the data layer: `listProductsWithDetails()`, `getProductBySlug()`, `getOrderByAccessToken()`, the `startCheckout` server action, and friends. The admin panel, checkout logic, payments, and delivery keep working untouched.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_SECRET` | yes | Encrypts payment credentials at rest; generate with `openssl rand -base64 32` |
| `APP_URL` | yes | Public base URL (no trailing slash) — used for payment redirects, webhooks, email links |
| `DATA_DIR` | no | Where uploads (images, deliverable files) are stored; default `./data`, `/app/data` in Docker |
| `APP_PORT`, `POSTGRES_*` | no | Compose-only overrides, see `.env.example` |

Everything else — payment keys, e-mail provider (SMTP/Resend/Brevo), Discord webhook, Turnstile, Google Analytics — is configured in the admin panel and stored encrypted in the database.

## Development

```bash
npm install
cp .env.example .env        # point DATABASE_URL at any Postgres
docker compose up -d db     # or bring your own database
npm run db:migrate          # apply migrations
npm run db:seed             # optional demo data (admin@example.com / demo-password-123)
npm run dev
```

No Postgres at hand? `npx tsx scripts/dev-db.ts` serves a real Postgres wire protocol on port 5433 backed by [PGlite](https://pglite.dev) — point `DATABASE_URL` at `postgres://dev:dev@localhost:5433/postgres`.

Useful scripts:

- `npm run typecheck` — strict TypeScript over the whole project
- `npm run db:generate` — generate a new migration after editing `src/lib/db/schema.ts`
- `npm run db:seed:demo` — bulk demo orders/customers to fill the dashboards
- `npx tsx scripts/verify-db.ts` — apply migrations to an in-memory Postgres and smoke-test the schema

## Architecture notes

- **Next.js App Router** (server components + server actions), Tailwind CSS v4 + shadcn/ui, Postgres via Drizzle ORM, better-auth for the admin session
- **Single shop per instance**, but every table carries a `shop_id` so a future multi-tenant mode is a permissions change, not a schema rewrite
- **Payments are pluggable**: implement `PaymentProvider` (`src/lib/payments/provider.ts`) and a webhook route; Stripe and NOWPayments are the references
- **Stock reservation** uses `SELECT … FOR UPDATE SKIP LOCKED`, so concurrent checkouts never double-sell a serial; a background loop expires unpaid orders after 30 minutes
- **Deliverable files** are streamed through an order-token-gated route; they are never publicly reachable

## Security

- Webhooks are signature-verified (Stripe signatures, NOWPayments HMAC-SHA512), bound to the exact payment record we created, and amount/currency-checked before anything is delivered; finalization is idempotent and race-safe
- Payment keys and other secrets are AES-256-GCM encrypted at rest with `APP_SECRET`
- Order links use 192-bit random tokens; a strict `Referrer-Policy` keeps them out of cross-origin requests
- Layered rate limits (per IP, per e-mail, per order token), validated forwarded-IP headers, CSV export formula-injection protection, global security headers
- Run behind a reverse proxy with HTTPS (Cloudflare recommended — its headers also power the country blacklist), and keep `APP_SECRET` safe

## Backups

Back up two things: the Postgres database and the `data/` volume (product images and deliverable files). Payment credentials in the database are encrypted with `APP_SECRET` — losing that secret means re-entering them.

## Hosting & custom work

Don't want to self-host, or need the shop tailored to you? I offer paid services around this project:

- **Managed hosting** — I set up and run the shop for you
- **Customization** — custom storefront design, themes, new features, payment providers
- **General work** — integrations, migrations from other platforms, or anything else you need built

Reach out on Discord (**`barkiegg`**) or by e-mail at [barkie.media@gmail.com](mailto:barkie.media@gmail.com).

## Contributing

You can contribute and donate to the project here: https://ko-fi.com/barkiedev

## License

[MIT](LICENSE) — do whatever you want with it: self-host, modify, redistribute, sell, keep your changes private. Just keep the copyright notice.
