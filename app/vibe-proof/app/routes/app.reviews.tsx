import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const genuineSource = { notIn: ["AI_DEMO", "TEST"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "ALL";
  const source = url.searchParams.get("source") ?? "ALL";

  const filteredWhere = {
    shop: session.shop,
    source:
      source === "ALL"
        ? genuineSource
        : source,
    ...(status === "ALL" ? {} : { status }),
    ...(q
      ? {
          OR: [
            { reviewerName: { contains: q } },
            { title: { contains: q } },
            { body: { contains: q } },
            { productTitle: { contains: q } },
          ],
        }
      : {}),
  };

  const [
    reviews,
    totalReviews,
    pendingReviews,
    approvedReviews,
    ratingStats,
    replyTargets,
  ] = await Promise.all([
    prisma.review.findMany({
      where: filteredWhere,
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        media: true,
        merchantReply: true,
      },
    }),

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
      _avg: {
        rating: true,
      },
    }),

    prisma.review.findMany({
      where: {
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { merchantReply: true },
    }),
  ]);

  return {
    q,
    status,
    source,
    totalReviews,
    pendingReviews,
    approvedReviews,
    averageRating: ratingStats._avg.rating,
    reviews: reviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewerName,
      rating: review.rating,
      productTitle: review.productTitle ?? "Unknown product",
      status: review.status,
      source: review.source,
      mediaCount: review.media.length,
      helpfulCount: review.helpfulCount,
      featured: review.featured,
      hasReply: Boolean(review.merchantReply),
      createdAt: review.createdAt.toISOString(),
    })),
    replyTargets: replyTargets.map((review) => ({
      id: review.id,
      label: `${review.reviewerName} · ${review.productTitle ?? "Unknown product"}`,
      replyBody: review.merchantReply?.body ?? "",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const reviewId = formData.get("reviewId");
  const intent = formData.get("intent");

  if (typeof intent !== "string") {
    return { ok: false, message: "Missing action." };
  }

  if (intent === "save_reply") {
    const replyReviewId = formData.get("replyReviewId");
    const replyBody = formData.get("replyBody");

    if (
      typeof replyReviewId !== "string" ||
      typeof replyBody !== "string" ||
      !replyBody.trim()
    ) {
      return { ok: false, message: "Choose a review and enter a reply." };
    }

    const review = await prisma.review.findFirst({
      where: {
        id: replyReviewId,
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
      },
    });

    if (!review) {
      return { ok: false, message: "Review not found." };
    }

    await prisma.merchantReply.upsert({
      where: { reviewId: review.id },
      create: {
        reviewId: review.id,
        body: replyBody.trim(),
        merchantName: "Store team",
      },
      update: {
        body: replyBody.trim(),
      },
    });

    return { ok: true, message: "Reply saved." };
  }

  if (intent === "delete_reply") {
    const replyReviewId = formData.get("replyReviewId");

    if (typeof replyReviewId !== "string") {
      return { ok: false, message: "Choose a review." };
    }

    const review = await prisma.review.findFirst({
      where: {
        id: replyReviewId,
        shop: session.shop,
        source: genuineSource,
      },
      select: { id: true },
    });

    if (!review) {
      return { ok: false, message: "Review not found." };
    }

    await prisma.merchantReply.deleteMany({
      where: { reviewId: review.id },
    });

    return { ok: true, message: "Reply removed." };
  }

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
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: "APPROVED",
        publishedAt: new Date(),
      },
    });
    return { ok: true, message: "Review approved." };
  }

  if (intent === "reject") {
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: "REJECTED",
        featured: false,
        publishedAt: null,
      },
    });
    return { ok: true, message: "Review rejected." };
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
    intent: "approve" | "reject" | "feature" | "unfeature",
  ) => {
    fetcher.submit(
      {
        reviewId,
        intent,
      },
      {
        method: "post",
      },
    );
  };

  return (
    <s-page heading="Reviews">
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
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
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Find reviews">
        <Form method="get">
          <s-grid
            gridTemplateColumns="2fr 1fr 1fr auto"
            gap="base"
            alignItems="end"
          >
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
            </s-select>

            <s-select label="Source" name="source" value={data.source}>
              <s-option value="ALL">All genuine sources</s-option>
              <s-option value="CUSTOMER">Customer</s-option>
              <s-option value="IMPORT">Import</s-option>
              <s-option value="MERCHANT_IMPORT">Merchant import</s-option>
            </s-select>

            <s-button type="submit" variant="secondary">
              Filter
            </s-button>
          </s-grid>
        </Form>
      </s-section>

      {data.reviews.length === 0 ? (
        <s-section heading="No reviews found">
          <s-paragraph>
            No genuine reviews match the current filters. AI demo content is managed
            separately in AI Studio.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading="All reviews" padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Reviewer</s-table-header>
              <s-table-header format="numeric">Rating</s-table-header>
              <s-table-header>Product</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Source</s-table-header>
              <s-table-header format="numeric">Helpful</s-table-header>
              <s-table-header>Featured</s-table-header>
              <s-table-header>Reply</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {data.reviews.map((review) => {
                const isBusy =
                  fetcher.state !== "idle" && submittingReviewId === review.id;

                return (
                  <s-table-row key={review.id}>
                    <s-table-cell>{review.reviewerName}</s-table-cell>
                    <s-table-cell>{String(review.rating)}</s-table-cell>
                    <s-table-cell>{review.productTitle}</s-table-cell>
                    <s-table-cell>
                      {review.status === "APPROVED" ? (
                        <s-badge tone="success">Approved</s-badge>
                      ) : review.status === "REJECTED" ? (
                        <s-badge tone="critical">Rejected</s-badge>
                      ) : (
                        <s-badge tone="warning">Pending</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>{review.source}</s-table-cell>
                    <s-table-cell>{String(review.helpfulCount)}</s-table-cell>
                    <s-table-cell>{review.featured ? "Yes" : "No"}</s-table-cell>
                    <s-table-cell>{review.hasReply ? "Replied" : "No reply"}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small">
                        {review.status === "PENDING" && (
                          <>
                            <s-button
                              variant="primary"
                              loading={
                                isBusy && submittingIntent === "approve"
                              }
                              onClick={() => moderateReview(review.id, "approve")}
                            >
                              Approve
                            </s-button>
                            <s-button
                              variant="secondary"
                              loading={
                                isBusy && submittingIntent === "reject"
                              }
                              onClick={() => moderateReview(review.id, "reject")}
                            >
                              Reject
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

                        {review.status === "REJECTED" && (
                          <s-text color="subdued">Moderated</s-text>
                        )}
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section heading="Merchant reply">
        {data.replyTargets.length === 0 ? (
          <s-paragraph>
            Approve a genuine review before adding a public merchant reply.
          </s-paragraph>
        ) : (
          <Form method="post">
            <s-stack direction="block" gap="base">
              <input type="hidden" name="intent" value="save_reply" />

              <s-select label="Approved review" name="replyReviewId">
                {data.replyTargets.map((review) => (
                  <s-option key={review.id} value={review.id}>
                    {review.label}
                  </s-option>
                ))}
              </s-select>

              <s-text-area
                label="Public reply"
                name="replyBody"
                rows={4}
                placeholder="Thanks for sharing your experience!"
              ></s-text-area>

              <s-stack direction="inline" gap="base">
                <s-button type="submit" variant="primary">
                  Save reply
                </s-button>
              </s-stack>
            </s-stack>
          </Form>
        )}
      </s-section>

      <s-section heading="Rating integrity">
        <s-paragraph>
          Public rating and storefront counts use APPROVED genuine reviews only.
          Pending, rejected, TEST, and AI_DEMO content never affects the published rating.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
