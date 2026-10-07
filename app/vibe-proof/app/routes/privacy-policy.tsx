export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>VibeProof Privacy Policy</h1>
      <p>Last updated: October 7, 2026</p>
      <p>
        VibeProof provides product review collection, moderation, display, media,
        post-purchase review requests, analytics, imports, and optional AI-assisted
        merchant tools for Shopify stores.
      </p>
      <h2>Information processed</h2>
      <p>
        Depending on merchant settings, VibeProof can process store and product
        identifiers, review text and ratings, reviewer name and email, customer
        photo/video review media, order identifiers and purchaser email for
        post-purchase review requests and purchase verification, and limited
        first-party interaction events used to measure the VibeProof review
        experience.
      </p>
      <h2>How information is used</h2>
      <p>
        Information is used to operate review collection and moderation, display
        approved reviews, send merchant-enabled review requests, verify qualifying
        purchases, prevent abuse, provide review analytics, and operate optional
        AI-assisted features requested by merchants.
      </p>
      <h2>Service providers</h2>
      <p>
        VibeProof can use a PostgreSQL hosting provider for application data,
        Cloudinary for customer review media, Resend for review-request email, and
        a merchant-configured AI provider for optional AI features. Merchants can
        disable media, email, or AI functionality when it is not needed.
      </p>
      <h2>Review publication</h2>
      <p>
        Only merchant-approved genuine reviews are returned by the public review
        feed. Reviewer email addresses are not returned by the public storefront
        API. AI-generated demo content is kept separate from genuine customer
        reviews and does not contribute to public review ratings.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Merchants can configure analytics retention. VibeProof responds to
        Shopify&apos;s customer data request, customer redaction, and shop
        redaction webhooks. Store data is deleted when required by Shopify
        redaction workflows and when the app is uninstalled, subject to any
        legally required retention.
      </p>
      <h2>Security</h2>
      <p>
        Review-request tokens are encrypted at rest and hashed for lookup.
        Storefront write actions are rate limited, media uploads use short-lived
        signed upload credentials, and verified-purchase status requires a
        qualifying signed post-purchase request.
      </p>
      <h2>Contact</h2>
      <p>
        Before public launch, replace this paragraph with the legal business name,
        support email, and mailing address shown in the Shopify App Store listing.
      </p>
    </main>
  );
}
