import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const genuineSource = { notIn: ["AI_DEMO", "TEST"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [total, pending, approved, ratingStats, demoCount, widgetTheme] =
    await Promise.all([
      prisma.review.count({
        where: { shop: session.shop, source: genuineSource },
      }),
      prisma.review.count({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "PENDING",
        },
      }),
      prisma.review.count({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "APPROVED",
        },
      }),
      prisma.review.aggregate({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "APPROVED",
        },
        _avg: { rating: true },
      }),
      prisma.review.count({
        where: { shop: session.shop, source: "AI_DEMO" },
      }),
      prisma.widgetTheme.findUnique({
        where: { shop: session.shop },
      }),
    ]);

  return {
    total,
    pending,
    approved,
    averageRating: ratingStats._avg.rating,
    demoCount,
    displayConfigured: Boolean(widgetTheme),
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="VibeProof">
      <s-section heading="Reviews made for the scroll">
        <s-paragraph>
          Turn customer reviews into social proof shoppers actually want to browse.
        </s-paragraph>
      </s-section>

      <s-section heading="Store health">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Genuine reviews</s-text>
            <s-heading>{String(data.total)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Pending moderation</s-text>
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
        </s-grid>
      </s-section>

      <s-section heading="Safety and setup">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-badge tone={data.displayConfigured ? "success" : "warning"}>
              {data.displayConfigured ? "Display configured" : "Display setup needed"}
            </s-badge>
            <s-text>{String(data.demoCount)} AI demo reviews</s-text>
          </s-stack>
          <s-paragraph>
            Only approved genuine reviews contribute to public ratings. AI demo
            content is isolated from public counts, analytics, and storefront output.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
