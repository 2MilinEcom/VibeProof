import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { GENUINE_REVIEW_SOURCES } from "../lib/constants.server";
import { mediaUploadEnabled } from "../lib/media.server";
import { reviewEmailEnabled } from "../lib/email.server";

const genuineSource = { in: [...GENUINE_REVIEW_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [total, pending, approved, ratingStats, demoCount, widgetTheme, requests, config] =
    await Promise.all([
      prisma.review.count({ where: { shop: session.shop, source: genuineSource } }),
      prisma.review.count({
        where: { shop: session.shop, source: genuineSource, status: "PENDING" },
      }),
      prisma.review.count({
        where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      }),
      prisma.review.aggregate({
        where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
        _avg: { rating: true },
      }),
      prisma.review.count({ where: { shop: session.shop, source: "AI_DEMO" } }),
      prisma.widgetTheme.findUnique({ where: { shop: session.shop } }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: { in: ["PENDING", "SENT"] } },
      }),
      prisma.shopConfig.findUnique({ where: { shop: session.shop } }),
    ]);

  const readiness = {
    postgres: Boolean(process.env.DATABASE_URL),
    media: mediaUploadEnabled(),
    email: reviewEmailEnabled(),
    cron: Boolean(process.env.CRON_SECRET),
    appUrl: Boolean(
      process.env.SHOPIFY_APP_URL &&
        !process.env.SHOPIFY_APP_URL.includes("example.com"),
    ),
    display: Boolean(widgetTheme),
  };

  return {
    total,
    pending,
    approved,
    averageRating: ratingStats._avg.rating,
    demoCount,
    requests,
    onboardingComplete: config?.onboardingComplete ?? false,
    readiness,
    readyCount: Object.values(readiness).filter(Boolean).length,
    readinessCount: Object.keys(readiness).length,
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const productionReady = data.readyCount === data.readinessCount;

  return (
    <s-page heading="VibeProof">
      <s-section heading="Reviews made for the scroll">
        <s-paragraph>
          Turn customer reviews into social proof shoppers actually want to browse.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/reviews">Moderate reviews</s-link>
          <s-link href="/app/collect">Collection settings</s-link>
          <s-link href="/app/display">Customize storefront</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Store health">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Genuine reviews</s-text>
            <s-heading>{String(data.total)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Pending</s-text>
            <s-heading>{String(data.pending)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approved)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Review requests</s-text>
            <s-heading>{String(data.requests)}</s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Launch readiness">
        <s-stack direction="block" gap="base">
          <s-badge tone={productionReady ? "success" : "warning"}>
            {productionReady
              ? "Production services configured"
              : `${data.readyCount}/${data.readinessCount} production checks ready`}
          </s-badge>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            {Object.entries(data.readiness).map(([label, ready]) => (
              <s-box key={label} padding="base" border="base" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-badge tone={ready ? "success" : "warning"}>
                    {ready ? "Ready" : "Setup"}
                  </s-badge>
                  <s-text>{label.replaceAll("_", " ")}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
          <s-link href="/app/settings">Open launch settings</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Integrity">
        <s-stack direction="block" gap="base">
          <s-text>{String(data.demoCount)} isolated AI demo reviews</s-text>
          <s-paragraph>
            Only approved genuine reviews contribute to public ratings and storefront
            output. AI demo, TEST, spam, pending, and rejected content stays outside
            public review metrics.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
