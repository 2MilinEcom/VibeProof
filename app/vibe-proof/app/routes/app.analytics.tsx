import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const genuineSource = { notIn: ["AI_DEMO", "TEST"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [approved, submitted, mediaCount, helpful, ratingStats, events] =
    await Promise.all([
      prisma.review.count({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "APPROVED",
        },
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
          review: {
            shop: session.shop,
            source: genuineSource,
          },
        },
      }),
      prisma.review.aggregate({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "APPROVED",
        },
        _sum: { helpfulCount: true },
      }),
      prisma.review.aggregate({
        where: {
          shop: session.shop,
          source: genuineSource,
          status: "APPROVED",
        },
        _avg: { rating: true },
      }),
      prisma.analyticsEvent.groupBy({
        by: ["type"],
        where: {
          shop: session.shop,
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
    ]);

  return {
    approved,
    submitted,
    mediaCount,
    helpfulVotes: helpful._sum.helpfulCount ?? 0,
    averageRating: ratingStats._avg.rating,
    events: events.map((event) => ({
      type: event.type,
      count: event._count._all,
    })),
  };
};

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics">
      <s-section heading="Review performance">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approved)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Submitted · 30d</s-text>
            <s-heading>{String(data.submitted)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Media</s-text>
            <s-heading>{String(data.mediaCount)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Helpful votes</s-text>
            <s-heading>{String(data.helpfulVotes)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Storefront events · last 30 days" padding="none">
        {data.events.length === 0 ? (
          <s-box padding="base">
            <s-text color="subdued">
              No storefront VibeProof events have been recorded yet.
            </s-text>
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
                  <s-table-cell>{event.type}</s-table-cell>
                  <s-table-cell>{String(event.count)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Metric integrity">
        <s-paragraph>
          AI_DEMO and TEST content is excluded from these review metrics. Public
          rating metrics include approved genuine reviews only.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
