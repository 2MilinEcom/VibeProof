import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { GENUINE_REVIEW_SOURCES } from "../lib/constants.server";

const genuineSource = { in: [...GENUINE_REVIEW_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    approved,
    submitted,
    mediaCount,
    helpful,
    ratingStats,
    events,
    topProducts,
    verification,
    requestStats,
  ] = await Promise.all([
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
    }),
    prisma.review.count({
      where: {
        shop: session.shop,
        source: genuineSource,
        createdAt: { gte: since },
      },
    }),
    prisma.reviewMedia.count({
      where: {
        review: { shop: session.shop, source: genuineSource },
        status: "APPROVED",
      },
    }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _sum: { helpfulCount: true },
    }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _avg: { rating: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: { shop: session.shop, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["productHandle"],
      where: {
        shop: session.shop,
        createdAt: { gte: since },
        productHandle: { not: null },
        type: { in: ["WIDGET_VIEW", "REVIEW_SUBMITTED", "HELPFUL_VOTE", "MEDIA_OPEN", "MEDIA_PLAY"] },
      },
      _count: { _all: true },
      orderBy: { _count: { productHandle: "desc" } },
      take: 10,
    }),
    prisma.review.groupBy({
      by: ["verifiedPurchase"],
      where: { shop: session.shop, source: genuineSource },
      _count: { _all: true },
    }),
    prisma.reviewRequest.groupBy({
      by: ["status"],
      where: { shop: session.shop },
      _count: { _all: true },
    }),
  ]);

  const eventCounts = Object.fromEntries(
    events.map((event) => [event.type, event._count._all]),
  );
  const views = eventCounts.WIDGET_VIEW ?? 0;
  const submissions = eventCounts.REVIEW_SUBMITTED ?? 0;
  const mediaOpens = (eventCounts.MEDIA_OPEN ?? 0) + (eventCounts.MEDIA_PLAY ?? 0);
  const engagement =
    views > 0
      ? ((eventCounts.HELPFUL_VOTE ?? 0) + mediaOpens + (eventCounts.FILTER_CHANGED ?? 0)) / views
      : 0;
  const submissionRate = views > 0 ? submissions / views : 0;

  return {
    approved,
    submitted,
    mediaCount,
    helpfulVotes: helpful._sum.helpfulCount ?? 0,
    averageRating: ratingStats._avg.rating,
    views,
    submissionRate,
    engagement,
    verifiedCount:
      verification.find((row) => row.verifiedPurchase)?._count._all ?? 0,
    requestStats: requestStats.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    events: events
      .map((event) => ({ type: event.type, count: event._count._all }))
      .sort((a, b) => b.count - a.count),
    topProducts: topProducts.map((row) => ({
      handle: row.productHandle ?? "Unknown",
      count: row._count._all,
    })),
  };
};

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics">
      <s-section heading="Review performance · last 30 days">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Widget views</s-text>
            <s-heading>{String(data.views)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Review submissions</s-text>
            <s-heading>{String(data.submitted)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Submission rate</s-text>
            <s-heading>{(data.submissionRate * 100).toFixed(1)}%</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Engagement / view</s-text>
            <s-heading>{(data.engagement * 100).toFixed(1)}%</s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Published social proof">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approved)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published media</s-text>
            <s-heading>{String(data.mediaCount)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Helpful votes</s-text>
            <s-heading>{String(data.helpfulVotes)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Verified reviews</s-text>
            <s-heading>{String(data.verifiedCount)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Storefront events" padding="none">
        {data.events.length === 0 ? (
          <s-box padding="base">
            <s-text color="subdued">No storefront events recorded yet.</s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Event</s-table-header>
              <s-table-header format="numeric">Count</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.events.map((event) => (
                <s-table-row key={event.type}>
                  <s-table-cell>{event.type.replaceAll("_", " ")}</s-table-cell>
                  <s-table-cell>{String(event.count)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Top product activity" padding="none">
        {data.topProducts.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No product activity yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product handle</s-table-header>
              <s-table-header format="numeric">Interactions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.topProducts.map((product) => (
                <s-table-row key={product.handle}>
                  <s-table-cell>{product.handle}</s-table-cell>
                  <s-table-cell>{String(product.count)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Post-purchase requests">
        <s-stack direction="inline" gap="base">
          {data.requestStats.length === 0 ? (
            <s-text color="subdued">No review requests queued yet.</s-text>
          ) : (
            data.requestStats.map((item) => (
              <s-badge key={item.status} tone={item.status === "COMPLETED" ? "success" : "neutral"}>
                {item.status}: {String(item.count)}
              </s-badge>
            ))
          )}
        </s-stack>
      </s-section>

      <s-section heading="Metric integrity">
        <s-paragraph>
          TEST and AI_DEMO records are excluded from genuine review metrics.
          Storefront engagement is first-party VibeProof activity recorded by the
          app proxy and theme extension; it does not claim order conversion
          attribution.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
