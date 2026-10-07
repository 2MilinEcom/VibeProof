import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [reviews, totalReviews, pendingReviews, ratingStats] =
    await Promise.all([
      prisma.review.findMany({
        where: {
          shop: session.shop,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
        include: {
          media: true,
          merchantReply: true,
        },
      }),

      prisma.review.count({
        where: {
          shop: session.shop,
        },
      }),

      prisma.review.count({
        where: {
          shop: session.shop,
          status: "PENDING",
        },
      }),

      prisma.review.aggregate({
        where: {
          shop: session.shop,
        },
        _avg: {
          rating: true,
        },
      }),
    ]);

  return {
    totalReviews,
    pendingReviews,
    averageRating: ratingStats._avg.rating,
    reviews: reviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewerName,
      rating: review.rating,
      productTitle: review.productTitle ?? "Unknown product",
      status: review.status,
      source: review.source,
      mediaCount: review.media.length,
      hasReply: Boolean(review.merchantReply),
      createdAt: review.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const reviewId = formData.get("reviewId");
  const intent = formData.get("intent");

  if (
    typeof reviewId !== "string" ||
    (intent !== "approve" && intent !== "reject")
  ) {
    return { ok: false };
  }

  const status =
    intent === "approve" ? "APPROVED" : "REJECTED";

  const result = await prisma.review.updateMany({
    where: {
      id: reviewId,
      shop: session.shop,

      // AI demo content can never be turned into a real review.
      source: {
        not: "AI_DEMO",
      },
    },
    data: {
      status,
    },
  });

  return {
    ok: result.count === 1,
  };
};

export default function ReviewsPage() {
  const {
    reviews,
    totalReviews,
    pendingReviews,
    averageRating,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<typeof action>();

  const submittingReviewId =
    fetcher.formData?.get("reviewId");

  const submittingIntent =
    fetcher.formData?.get("intent");

  const moderateReview = (
    reviewId: string,
    intent: "approve" | "reject",
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
      <s-section heading="Review database">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
        >
          <s-badge tone="success">
            Connected
          </s-badge>

          <s-text>
            VibeProof is reading reviews from the database.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="repeat(3, minmax(0, 1fr))"
          gap="base"
        >
          <s-box
            padding="base"
            border="base"
            borderRadius="base"
          >
            <s-text color="subdued">
              Total reviews
            </s-text>

            <s-heading>
              {String(totalReviews)}
            </s-heading>
          </s-box>

          <s-box
            padding="base"
            border="base"
            borderRadius="base"
          >
            <s-text color="subdued">
              Pending
            </s-text>

            <s-heading>
              {String(pendingReviews)}
            </s-heading>
          </s-box>

          <s-box
            padding="base"
            border="base"
            borderRadius="base"
          >
            <s-text color="subdued">
              Average rating
            </s-text>

            <s-heading>
              {averageRating === null
                ? "—"
                : averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      {reviews.length === 0 ? (
        <s-section heading="No reviews yet">
          <s-paragraph>
            The database is working correctly. There aren't
            any reviews stored yet.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section
          heading="All reviews"
          padding="none"
        >
          <s-table>
            <s-table-header-row>
              <s-table-header>
                Reviewer
              </s-table-header>

              <s-table-header format="numeric">
                Rating
              </s-table-header>

              <s-table-header>
                Product
              </s-table-header>

              <s-table-header>
                Status
              </s-table-header>

              <s-table-header>
                Source
              </s-table-header>

              <s-table-header format="numeric">
                Media
              </s-table-header>

              <s-table-header>
                Reply
              </s-table-header>

              <s-table-header>
                Actions
              </s-table-header>
            </s-table-header-row>

            <s-table-body>
              {reviews.map((review) => {
                const isApproving =
                  fetcher.state !== "idle" &&
                  submittingReviewId === review.id &&
                  submittingIntent === "approve";

                const isRejecting =
                  fetcher.state !== "idle" &&
                  submittingReviewId === review.id &&
                  submittingIntent === "reject";

                return (
                  <s-table-row key={review.id}>
                    <s-table-cell>
                      {review.reviewerName}
                    </s-table-cell>

                    <s-table-cell>
                      {String(review.rating)}
                    </s-table-cell>

                    <s-table-cell>
                      {review.productTitle}
                    </s-table-cell>

                    <s-table-cell>
                      {review.status === "APPROVED" ? (
                        <s-badge tone="success">
                          Approved
                        </s-badge>
                      ) : review.status === "REJECTED" ? (
                        <s-badge tone="critical">
                          Rejected
                        </s-badge>
                      ) : (
                        <s-badge tone="warning">
                          Pending
                        </s-badge>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      {review.source}
                    </s-table-cell>

                    <s-table-cell>
                      {String(review.mediaCount)}
                    </s-table-cell>

                    <s-table-cell>
                      {review.hasReply
                        ? "Replied"
                        : "No reply"}
                    </s-table-cell>

                    <s-table-cell>
                      {review.status === "PENDING" ? (
                        <s-stack direction="inline" gap="base">
                          <s-button
                            variant="primary"
                            loading={isApproving}
                            onClick={() =>
                              moderateReview(
                                review.id,
                                "approve",
                              )
                            }
                          >
                            Approve
                          </s-button>

                          <s-button
                            variant="secondary"
                            loading={isRejecting}
                            onClick={() =>
                              moderateReview(
                                review.id,
                                "reject",
                              )
                            }
                          >
                            Reject
                          </s-button>
                        </s-stack>
                      ) : (
                        <s-text color="subdued">
                          Moderated
                        </s-text>
                      )}
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}
