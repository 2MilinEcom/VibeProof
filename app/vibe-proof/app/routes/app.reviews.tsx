import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { GENUINE_REVIEW_SOURCES } from "../lib/constants.server";

const genuineSource = { in: [...GENUINE_REVIEW_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "ALL";
  const source = url.searchParams.get("source") ?? "ALL";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = 50;

  const filteredWhere = {
    shop: session.shop,
    source: source === "ALL" ? genuineSource : source,
    ...(status === "ALL" ? {} : { status }),
    ...(q
      ? {
          OR: [
            { reviewerName: { contains: q, mode: "insensitive" as const } },
            { title: { contains: q, mode: "insensitive" as const } },
            { body: { contains: q, mode: "insensitive" as const } },
            { productTitle: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [
    reviews,
    filteredCount,
    totalReviews,
    pendingReviews,
    approvedReviews,
    spamReviews,
    ratingStats,
  ] = await Promise.all([
    prisma.review.findMany({
      where: filteredWhere,
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        media: { orderBy: { position: "asc" } },
        merchantReply: true,
      },
    }),
    prisma.review.count({ where: filteredWhere }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "PENDING" },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "SPAM" },
    }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _avg: { rating: true },
    }),
  ]);

  return {
    q,
    status,
    source,
    page,
    pageSize,
    filteredCount,
    pageCount: Math.max(1, Math.ceil(filteredCount / pageSize)),
    totalReviews,
    pendingReviews,
    approvedReviews,
    spamReviews,
    averageRating: ratingStats._avg.rating,
    reviews: reviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewerName,
      rating: review.rating,
      productTitle: review.productTitle ?? "Unknown product",
      status: review.status,
      source: review.source,
      mediaCount: review.media.length,
      mediaPreview: review.media[0]?.url ?? null,
      mediaType: review.media[0]?.type ?? null,
      helpfulCount: review.helpfulCount,
      featured: review.featured,
      verifiedPurchase: review.verifiedPurchase,
      spamScore: review.spamScore,
      spamReason: review.spamReason,
      hasReply: Boolean(review.merchantReply),
      createdAt: review.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (typeof intent !== "string") {
    return { ok: false, message: "Missing action." };
  }

  if (intent === "bulk") {
    const ids = formData
      .getAll("reviewIds")
      .filter((value): value is string => typeof value === "string");
    const bulkIntent = formData.get("bulkIntent");

    if (
      ids.length === 0 ||
      typeof bulkIntent !== "string" ||
      !["approve", "reject", "spam"].includes(bulkIntent)
    ) {
      return { ok: false, message: "Choose reviews and a bulk action." };
    }

    const status =
      bulkIntent === "approve"
        ? "APPROVED"
        : bulkIntent === "spam"
          ? "SPAM"
          : "REJECTED";

    const reviews = await prisma.review.findMany({
      where: {
        id: { in: ids },
        shop: session.shop,
        source: genuineSource,
      },
      select: { id: true },
    });
    const safeIds = reviews.map((review) => review.id);

    await prisma.$transaction([
      prisma.review.updateMany({
        where: { id: { in: safeIds }, shop: session.shop },
        data: {
          status,
          featured: status === "APPROVED" ? undefined : false,
          publishedAt: status === "APPROVED" ? new Date() : null,
        },
      }),
      prisma.reviewMedia.updateMany({
        where: { reviewId: { in: safeIds } },
        data: { status: status === "APPROVED" ? "APPROVED" : "REJECTED" },
      }),
    ]);

    return { ok: true, message: `Updated ${safeIds.length} reviews.` };
  }

  const reviewId = formData.get("reviewId");
  if (typeof reviewId !== "string") {
    return { ok: false, message: "Missing review." };
  }

  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      shop: session.shop,
      source: genuineSource,
    },
  });

  if (!review) {
    return { ok: false, message: "Review not found." };
  }

  if (intent === "approve") {
    await prisma.$transaction([
      prisma.review.update({
        where: { id: review.id },
        data: {
          status: "APPROVED",
          publishedAt: new Date(),
        },
      }),
      prisma.reviewMedia.updateMany({
        where: { reviewId: review.id },
        data: { status: "APPROVED" },
      }),
    ]);
    return { ok: true, message: "Review approved." };
  }

  if (intent === "reject" || intent === "spam") {
    const status = intent === "spam" ? "SPAM" : "REJECTED";
    await prisma.$transaction([
      prisma.review.update({
        where: { id: review.id },
        data: {
          status,
          featured: false,
          publishedAt: null,
        },
      }),
      prisma.reviewMedia.updateMany({
        where: { reviewId: review.id },
        data: { status: "REJECTED" },
      }),
    ]);
    return { ok: true, message: `Review marked ${status.toLowerCase()}.` };
  }

  if (intent === "feature" || intent === "unfeature") {
    if (review.status !== "APPROVED") {
      return { ok: false, message: "Only approved reviews can be featured." };
    }

    await prisma.review.update({
      where: { id: review.id },
      data: { featured: intent === "feature" },
    });

    return {
      ok: true,
      message: intent === "feature" ? "Review featured." : "Review unfeatured.",
    };
  }

  return { ok: false, message: "Unknown action." };
};

export default function ReviewsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const submittingReviewId = fetcher.formData?.get("reviewId");
  const submittingIntent = fetcher.formData?.get("intent");

  const moderateReview = (
    reviewId: string,
    intent: "approve" | "reject" | "spam" | "feature" | "unfeature",
  ) => {
    fetcher.submit({ reviewId, intent }, { method: "post" });
  };

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    if (data.status !== "ALL") params.set("status", data.status);
    if (data.source !== "ALL") params.set("source", data.source);
    params.set("page", String(page));
    return `/app/reviews?${params.toString()}`;
  };

  return (
    <s-page heading="Reviews">
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Genuine reviews</s-text>
            <s-heading>{String(data.totalReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Pending</s-text>
            <s-heading>{String(data.pendingReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approvedReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Spam queue</s-text>
            <s-heading>{String(data.spamReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Find reviews">
        <Form method="get">
          <s-grid gridTemplateColumns="2fr 1fr 1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Search"
              name="q"
              defaultValue={data.q}
              placeholder="Reviewer, product, title, or review text"
              icon="search"
            ></s-text-field>
            <s-select label="Status" name="status" value={data.status}>
              <s-option value="ALL">All statuses</s-option>
              <s-option value="PENDING">Pending</s-option>
              <s-option value="APPROVED">Approved</s-option>
              <s-option value="REJECTED">Rejected</s-option>
              <s-option value="SPAM">Spam</s-option>
            </s-select>
            <s-select label="Source" name="source" value={data.source}>
              <s-option value="ALL">All genuine sources</s-option>
              <s-option value="CUSTOMER">Customer</s-option>
              <s-option value="IMPORT">Import</s-option>
              <s-option value="MERCHANT_IMPORT">Merchant import</s-option>
            </s-select>
            <s-button type="submit" variant="secondary">Filter</s-button>
          </s-grid>
        </Form>
      </s-section>

      {data.reviews.length === 0 ? (
        <s-section heading="No reviews found">
          <s-paragraph>No genuine reviews match the current filters.</s-paragraph>
        </s-section>
      ) : (
        <Form method="post">
          <input type="hidden" name="intent" value="bulk" />
          <s-section heading="Moderation queue">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
              <s-select label="Bulk action" name="bulkIntent" value="approve">
                <s-option value="approve">Approve selected</s-option>
                <s-option value="reject">Reject selected</s-option>
                <s-option value="spam">Mark selected as spam</s-option>
              </s-select>
              <s-button type="submit" variant="secondary">Apply</s-button>
            </s-grid>
          </s-section>

          <s-section heading="All reviews" padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header>Select</s-table-header>
                <s-table-header listSlot="primary">Reviewer</s-table-header>
                <s-table-header format="numeric">Rating</s-table-header>
                <s-table-header>Product</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Proof</s-table-header>
                <s-table-header format="numeric">Media</s-table-header>
                <s-table-header format="numeric">Helpful</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.reviews.map((review) => {
                  const isBusy =
                    fetcher.state !== "idle" && submittingReviewId === review.id;

                  return (
                    <s-table-row key={review.id}>
                      <s-table-cell>
                        <s-checkbox
                          label={`Select ${review.reviewerName}`}
                          labelAccessibilityVisibility="exclusive"
                          name="reviewIds"
                          value={review.id}
                        ></s-checkbox>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="block" gap="small">
                          <s-link href={`/app/reviews/${review.id}`}>
                            {review.reviewerName}
                          </s-link>
                          {review.spamScore > 0 && (
                            <s-text color="subdued">
                              Spam score {String(review.spamScore)}
                            </s-text>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{String(review.rating)}</s-table-cell>
                      <s-table-cell>{review.productTitle}</s-table-cell>
                      <s-table-cell>
                        {review.status === "APPROVED" ? (
                          <s-badge tone="success">Approved</s-badge>
                        ) : review.status === "REJECTED" ? (
                          <s-badge tone="critical">Rejected</s-badge>
                        ) : review.status === "SPAM" ? (
                          <s-badge tone="critical">Spam</s-badge>
                        ) : (
                          <s-badge tone="warning">Pending</s-badge>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {review.verifiedPurchase ? (
                          <s-badge tone="success">Verified</s-badge>
                        ) : (
                          <s-text color="subdued">Unverified</s-text>
                        )}
                      </s-table-cell>
                      <s-table-cell>{String(review.mediaCount)}</s-table-cell>
                      <s-table-cell>{String(review.helpfulCount)}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          {review.status !== "APPROVED" && (
                            <s-button
                              variant="primary"
                              loading={isBusy && submittingIntent === "approve"}
                              onClick={() => moderateReview(review.id, "approve")}
                            >
                              Approve
                            </s-button>
                          )}
                          {review.status === "PENDING" && (
                            <>
                              <s-button
                                variant="secondary"
                                loading={isBusy && submittingIntent === "reject"}
                                onClick={() => moderateReview(review.id, "reject")}
                              >
                                Reject
                              </s-button>
                              <s-button
                                variant="secondary"
                                loading={isBusy && submittingIntent === "spam"}
                                onClick={() => moderateReview(review.id, "spam")}
                              >
                                Spam
                              </s-button>
                            </>
                          )}
                          {review.status === "APPROVED" && (
                            <s-button
                              variant="secondary"
                              loading={
                                isBusy &&
                                (submittingIntent === "feature" ||
                                  submittingIntent === "unfeature")
                              }
                              onClick={() =>
                                moderateReview(
                                  review.id,
                                  review.featured ? "unfeature" : "feature",
                                )
                              }
                            >
                              {review.featured ? "Unfeature" : "Feature"}
                            </s-button>
                          )}
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-section>
        </Form>
      )}

      <s-section heading="Pages">
        <s-stack direction="inline" gap="base" alignItems="center">
          {data.page > 1 && (
            <s-link href={pageHref(data.page - 1)}>Previous</s-link>
          )}
          <s-text>
            Page {String(data.page)} of {String(data.pageCount)} ·{" "}
            {String(data.filteredCount)} matching reviews
          </s-text>
          {data.page < data.pageCount && (
            <s-link href={pageHref(data.page + 1)}>Next</s-link>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Rating integrity">
        <s-paragraph>
          Public rating and storefront counts use approved genuine reviews only.
          Pending, rejected, spam, TEST, and AI_DEMO content never affects the published rating.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
