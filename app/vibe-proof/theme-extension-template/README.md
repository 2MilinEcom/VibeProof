# VibeProof Theme App Extension source

This directory is the reusable source for the committed
`extensions/vibeproof-reviews` Theme App Extension.

The extension exposes four product-template app blocks:

- VibeProof rating bar
- VibeProof review feed
- VibeProof review form
- VibeProof UGC gallery

The storefront JavaScript is split into small modules:

- `vibeproof.js` loads the block-specific module.
- `vibeproof-feed.js` handles ratings, sort/filter controls, UGC, lightbox,
  helpful votes, sharing, and review engagement events.
- `vibeproof-form.js` handles review submission, signed photo/video uploads,
  signed post-purchase request context, and submission analytics.

Re-apply the source to the generated extension with:

```bash
bash scripts/apply-theme-extension-template.sh
```

Then validate:

```bash
shopify app build
```

Public storefront review queries return only APPROVED genuine review sources.
AI_DEMO, TEST, pending, rejected, and spam content is never returned as genuine
storefront social proof.
