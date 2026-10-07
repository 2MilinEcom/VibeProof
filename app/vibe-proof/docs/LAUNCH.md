# VibeProof production launch

VibeProof's application code is prepared for a Docker-based production host with
PostgreSQL. The storefront runs through a Shopify Theme App Extension and app
proxy. Customer media uploads directly to Cloudinary using short-lived signatures.

## Required production services

1. PostgreSQL database
2. Public HTTPS application host
3. Cloudinary account for photo/video reviews
4. Resend account/domain for post-purchase review email
5. A scheduler that POSTs to the two internal cron endpoints with the CRON_SECRET
6. Shopify protected customer/order data approval for verified-purchase collection
7. Shopify App Pricing plans in Partner Dashboard if charging merchants

AI is optional. Configure any OpenAI-compatible chat-completions endpoint with
AI_API_URL, AI_API_KEY, and AI_MODEL.

## Scheduler

Call both endpoints on a recurring schedule:

- POST /internal/review-requests every 15 minutes
- POST /internal/maintenance daily

Header:

Authorization: Bearer <CRON_SECRET>

## Shopify configuration

After setting the production application URL, update shopify.app.toml:

- application_url
- auth.redirect_urls
- app_proxy.url remains /apps/vibeproof because Shopify forwards it to the app URL

Then validate and deploy the app configuration and extensions with Shopify CLI.

## App pricing

VibeProof uses Shopify App Pricing, not recurring-charge creation in application
code. Configure public/private plan names, prices, trials, features, and welcome
links in Partner Dashboard. Store the selected plan handle in VibeProof Settings
only if you need feature gating.

## Protected customer data

Post-purchase review requests use order email and line item data. For a public app,
request the required protected customer data access in Shopify before submitting the
app. The app asks for read_orders and read_products; avoid read_all_orders unless a
future feature truly needs orders older than 60 days.

## Privacy

Mandatory compliance endpoints are implemented for:

- customers/data_request
- customers/redact
- shop/redact

Customer data requests appear under VibeProof > Privacy. Redaction requests delete
matching customer review/request data. Shop redaction removes shop data.

## Data integrity

- Public ratings use only APPROVED genuine sources.
- AI_DEMO and TEST never affect public ratings or storefront output.
- Signed post-purchase links are required for automatic verified-purchase status.
- Helpful votes are deduplicated by a privacy-preserving request fingerprint.
- Storefront write paths are rate limited.
- Review media must use signed Cloudinary upload tokens.

## Database note

The launch-ready branch uses a PostgreSQL baseline migration. Existing local SQLite
development rows are not automatically copied. If those test rows matter, export
them before switching DATABASE_URL; otherwise start production with a clean database.
