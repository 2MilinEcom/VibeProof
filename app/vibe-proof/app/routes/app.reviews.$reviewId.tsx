import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { GENUINE_REVIEW_SOURCES } from "../lib/constants.server";

const genuineSource = { in: [...GENUINE_REVIEW_SOURCES] };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const reviewId = params.reviewId;

  if (!reviewId) throw new Response("Not found", { status: 404 });

  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      shop: session.shop,
      source: genuineSource,
    },
    include: {
      media: { orderBy: { position: "asc" } },
      merchantReply: true,
    },
  });

  if (!review) throw new Response("Not found", { status: 404 });

  return {
    review: {
      ...review,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      publishedAt: review.publishedAt?.toISOString() ?? null,
      verifiedAt: review.verifiedAt?.toISOString() ?? null,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const reviewId = params.reviewId;
  if (!reviewId) return { ok: false, message: "Review not found." };

  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      shop: session.shop,
      source: genuineSource,
    },
    select: { id: true, status: true },
  });
  if (!review) return { ok: false, message: "Review not found." };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "edit") {
    const rating = Math.max(1, Math.min(5, Number(formData.get("rating") || 5)));
    const reviewerName = String(formData.get("reviewerName") || "").trim().slice(0, 120);
    const title = String(formData.get("title") || "").trim().slice(0, 160);
    const body = String(formData.get("body") || "").trim().slice(0, 5000);
    const notes = String(formData.get("moderationNotes") || "").trim().slice(0, 2000);

    if (!reviewerName || !body) {
      return { ok: false, message: "Reviewer name and review body are required." };
    }

    await prisma.review.update({
      where: { id: review.id },
      data: {
        rating,
        reviewerName,
        title: title || null,
        body,
        moderationNotes: notes || null,
      },
    });
    return { ok: true, message: "Review updated." };
  }

  if (intent === "approve" || intent === "reject" || intent === "spam") {
    const status =
      intent === "approve" ? "APPROVED" : intent === "spam" ? "SPAM" : "REJECTED";

    await prisma.$transaction([
      prisma.review.update({
        where: { id: review.id },
        data: {
          status,
          featured: status === "APPROVED" ? undefined : false,
          publishedAt: status === "APPROVED" ? new Date() : null,
        },
      }),
      prisma.reviewMedia.updateMany({
        where: { reviewId: review.id },
        data: { status: status === "APPROVED" ? "APPROVED" : "REJECTED" },
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
    return { ok: true, message: intent === "feature" ? "Featured." : "Unfeatured." };
  }

  if (intent === "media_status") {
    const mediaId = String(formData.get("mediaId") || "");
    const mediaStatus = String(formData.get("mediaStatus") || "");
    if (!["APPROVED", "REJECTED"].includes(mediaStatus)) {
      return { ok: false, message: "Invalid media status." };
    }

    const media = await prisma.reviewMedia.findFirst({
      where: { id: mediaId, reviewId: review.id },
      select: { id: true },
    });
    if (!media) return { ok: false, message: "Media not found." };

    await prisma.reviewMedia.update({
      where: { id: media.id },
      data: { status: mediaStatus },
    });
    return { ok: true, message: "Media updated." };
  }

  if (intent === "save_reply") {
    const body = String(formData.get("replyBody") || "").trim().slice(0, 2000);
    const merchantName = String(formData.get("merchantName") || "Store team")
      .trim()
      .slice(0, 120);

    if (!body) return { ok: false, message: "Reply cannot be empty." };

    await prisma.merchantReply.upsert({
      where: { reviewId: review.id },
      create: { reviewId: review.id, body, merchantName: merchantName || null },
      update: { body, merchantName: merchantName || null },
    });
    return { ok: true, message: "Reply saved." };
  }

  if (intent === "delete_reply") {
    await prisma.merchantReply.deleteMany({ where: { reviewId: review.id } });
    return { ok: true, message: "Reply deleted." };
  }

  if (intent === "delete_review") {
    await prisma.review.delete({ where: { id: review.id } });
    return redirect("/app/reviews");
  }

  return { ok: false, message: "Unknown action." };
};

export default function ReviewDetailPage() {
  const { review } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Review detail">
      <s-section heading="Status">
        <s-stack direction="inline" gap="base" alignItems="center">
          {review.status === "APPROVED" ? (
            <s-badge tone="success">Approved</s-badge>
          ) : review.status === "REJECTED" ? (
            <s-badge tone="critical">Rejected</s-badge>
          ) : review.status === "SPAM" ? (
            <s-badge tone="critical">Spam</s-badge>
          ) : (
            <s-badge tone="warning">Pending</s-badge>
          )}
          {review.verifiedPurchase && <s-badge tone="success">Verified purchase</s-badge>}
          {review.featured && <s-badge tone="info">Featured</s-badge>}
          <s-text>Source: {review.source}</s-text>
          <s-text>Spam score: {String(review.spamScore)}</s-text>
        </s-stack>
        {review.spamReason && (
          <s-paragraph>Spam signals: {review.spamReason}</s-paragraph>
        )}
      </s-section>

      <s-section heading="Edit review">
        <Form method="post">
          <input type="hidden" name="intent" value="edit" />
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 160px" gap="base">
              <s-text-field
                label="Reviewer name"
                name="reviewerName"
                defaultValue={review.reviewerName}
                required
              ></s-text-field>
              <s-number-field
                label="Rating"
                name="rating"
                min={1}
                max={5}
                step={1}
                defaultValue={String(review.rating)}
              ></s-number-field>
            </s-grid>
            <s-text-field
              label="Title"
              name="title"
              defaultValue={review.title ?? ""}
            ></s-text-field>
            <s-text-area
              label="Review"
              name="body"
              rows={6}
              defaultValue={review.body}
            ></s-text-area>
            <s-text-area
              label="Private moderation notes"
              name="moderationNotes"
              rows={3}
              defaultValue={review.moderationNotes ?? ""}
            ></s-text-area>
            <s-button type="submit" variant="primary">Save review</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Moderation">
        <s-stack direction="inline" gap="base">
          {review.status !== "APPROVED" && (
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <s-button type="submit" variant="primary">Approve</s-button>
            </Form>
          )}
          {review.status === "PENDING" && (
            <>
              <Form method="post">
                <input type="hidden" name="intent" value="reject" />
                <s-button type="submit" variant="secondary">Reject</s-button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="spam" />
                <s-button type="submit" variant="secondary">Mark spam</s-button>
              </Form>
            </>
          )}
          {review.status === "APPROVED" && (
            <Form method="post">
              <input
                type="hidden"
                name="intent"
                value={review.featured ? "unfeature" : "feature"}
              />
              <s-button type="submit" variant="secondary">
                {review.featured ? "Unfeature" : "Feature"}
              </s-button>
            </Form>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Customer media">
        {review.media.length === 0 ? (
          <s-text color="subdued">No media attached.</s-text>
        ) : (
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
            {review.media.map((media) => (
              <s-box key={media.id} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  {media.type === "VIDEO" ? (
                    <video
                      src={media.url}
                      controls
                      playsInline
                      style={{ width: "100%", maxHeight: 360, borderRadius: 12 }}
                    />
                  ) : (
                    <img
                      src={media.url}
                      alt={media.altText || "Review media"}
                      style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 12 }}
                    />
                  )}
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-badge tone={media.status === "APPROVED" ? "success" : "warning"}>
                      {media.status}
                    </s-badge>
                    <s-text>
                      {media.bytes ? `${Math.round(media.bytes / 1024)} KB` : ""}
                    </s-text>
                  </s-stack>
                  <Form method="post">
                    <input type="hidden" name="intent" value="media_status" />
                    <input type="hidden" name="mediaId" value={media.id} />
                    <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
                      <s-select label="Media status" name="mediaStatus" value={media.status}>
                        <s-option value="APPROVED">Approved</s-option>
                        <s-option value="REJECTED">Rejected</s-option>
                      </s-select>
                      <s-button type="submit" variant="secondary">Update</s-button>
                    </s-grid>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
        )}
      </s-section>

      <s-section heading="Merchant reply">
        <Form method="post">
          <input type="hidden" name="intent" value="save_reply" />
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Merchant name"
              name="merchantName"
              defaultValue={review.merchantReply?.merchantName ?? "Store team"}
            ></s-text-field>
            <s-text-area
              label="Public reply"
              name="replyBody"
              rows={4}
              defaultValue={review.merchantReply?.body ?? ""}
            ></s-text-area>
            <s-button type="submit" variant="primary">Save reply</s-button>
          </s-stack>
        </Form>
        {review.merchantReply && (
          <Form method="post">
            <input type="hidden" name="intent" value="delete_reply" />
            <s-button type="submit" variant="secondary" tone="critical">
              Delete reply
            </s-button>
          </Form>
        )}
      </s-section>

      <s-section heading="Danger zone">
        <Form method="post">
          <input type="hidden" name="intent" value="delete_review" />
          <s-button type="submit" variant="secondary" tone="critical">
            Permanently delete review
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}
