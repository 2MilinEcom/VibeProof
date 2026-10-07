# VibeProof

**Reviews made for the scroll.**

VibeProof is an embedded Shopify reviews app with a social-native storefront
experience, genuine-review moderation, customer photo/video reviews,
post-purchase collection, verified-purchase links, merchant replies, imports,
first-party review analytics, safe AI assistance, and Theme App Extension blocks.

## Storefront

The Theme App Extension exposes:

- VibeProof rating bar
- VibeProof review feed
- VibeProof review form
- VibeProof UGC gallery

Published storefront ratings and review content include only APPROVED reviews
from genuine sources. AI_DEMO, TEST, pending, rejected, and spam records are
kept out of public ratings and storefront output.

## Admin

- Home: store health and launch readiness
- Reviews: search, filters, bulk moderation, spam queue, media moderation
- Collect: review form, photo/video, post-purchase requests and reminders
- Display: social layouts, colors, filters, rating breakdown, product overrides
- AI Studio: reply drafts, review insights, safe demo previews, design tokens
- Analytics: widget, media, helpful and submission engagement
- Imports: generic CSV, Loox, Judge.me and Yotpo CSV mappings
- Privacy: Shopify compliance request center
- Settings: production-service readiness and merchant feature toggles

## Production stack

- React Router + Shopify App Bridge / Polaris web components
- Shopify Admin GraphQL
- Shopify Theme App Extension + app proxy
- PostgreSQL + Prisma
- Cloudinary direct customer media uploads
- Resend post-purchase email
- Optional OpenAI-compatible AI provider
- Docker-compatible application host

Copy `.env.example` into your deployment environment and configure the required
secrets. See [docs/LAUNCH.md](docs/LAUNCH.md) for production setup.

## Development

```bash
npm install
npm run setup
shopify app dev
```

The launch branch uses PostgreSQL. Existing SQLite development rows from older
branches are not automatically migrated.

## Validation

```bash
npm run validate:launch
shopify app config validate --json
shopify app build
```

GitHub Actions also validates Prisma migrations, TypeScript, and the production
React Router build.

## Theme extension

The generated extension is committed at:

`extensions/vibeproof-reviews`

The reusable source is also stored in `theme-extension-template`. To re-apply
the template after editing it:

```bash
bash scripts/apply-theme-extension-template.sh
```

## Privacy and review integrity

- Signed post-purchase request tokens are encrypted at rest and hashed for lookup.
- Customer/order access is used only for review-request and verification workflows.
- Helpful votes are deduplicated with a privacy-preserving fingerprint.
- Storefront write paths are rate limited.
- Mandatory Shopify customer data request/redaction and shop-redaction webhooks are implemented.
- AI demo content is permanently separated from genuine customer review metrics.

## Launch

Production launch still requires merchant-owned infrastructure and Shopify account
configuration: production hosting/domain, PostgreSQL credentials, Cloudinary,
Resend, protected customer-data approval for order-based verification, and
Shopify App Pricing setup if the app will charge merchants.

See [docs/LAUNCH.md](docs/LAUNCH.md).
