import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  GENUINE_REVIEW_SOURCES,
  MAX_MEDIA_ITEMS,
  MAX_REVIEW_BODY_LENGTH,
  MAX_REVIEW_TITLE_LENGTH,
  MAX_REVIEWER_NAME_LENGTH,
} from "../lib/constants.server";
import {
  consumeMediaUpload,
  createMediaUploadSignature,
  mediaUploadEnabled,
} from "../lib/media.server";
import {
  hashValue,
  normalizeEmail,
  rateLimit,
  requestFingerprint,
  scoreReviewSpam,
} from "../lib/security.server";

const publicSource = { in: [...GENUINE_REVIEW_SOURCES] };

const defaultTheme = {
  layout: "SOCIAL_FEED",
  heading: "THE GIRLIES SAID IT BEST",
  accentColor: "#111111",
  backgroundColor: "#FFFFFF",
  textColor: "#111111",
  borderColor: "#E5E7EB",
  radius: 18,
  mediaRatio: "4/5",
  showVerified: true,
  showHelpful: true,
  showMerchantReplies: true,
  showFilters: true,
  showRatingBreakdown: true,
  autoplayVideo: false,
  autoMatch: true,
  defaultSort: "FEATURED",
};

const defaultCollection = {
  collectRating: true,
  collectTitle: true,
  collectBody: true,
  collectEmail: true,
  collectPhoto: true,
  collectVideo: true,
  requireEmail: true,
  autoApproveFiveStar: false,
  maxMediaItems: 4,
  enablePostPurchaseRequests: true,
  requestDelayDays: 7,
  reminderDelayDays: 5,
  maxReminders: 1,
  autoVerifyOrders: true,
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { ...init, headers });
}

function stringValue(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

type MediaSubmission = {
  uploadToken?: string;
  publicId?: string;
  secureUrl?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  altText?: string;
};

function parseMedia(value: unknown): MediaSubmission[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_MEDIA_ITEMS) : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return json({ ok: false, error: "App session unavailable." }, { status: 401 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const productHandle = url.searchParams.get("product_handle")?.trim() ?? "";
  const productId = url.searchParams.get("product_id")?.trim() ?? "";
  const requestToken = url.searchParams.get("request_token")?.trim() ?? "";
  const sort = url.searchParams.get("sort")?.trim() ?? "";
  const rating = Number(url.searchParams.get("rating") || 0);
  const mediaOnly = url.searchParams.get("media_only") === "1";

  if (!productHandle) {
    return json({ ok: false, error: "Missing product handle." }, { status: 400 });
  }

  const [theme, productConfig, collection, reviewRequest] = await Promise.all([
    prisma.widgetTheme.findUnique({ where: { shop } }),
    prisma.productConfig.findFirst({ where: { shop, productHandle } }),
    prisma.collectionSettings.findUnique({ where: { shop } }),
    requestToken
      ? prisma.reviewRequest.findUnique({
          where: { tokenHash: hashValue(requestToken) },
        })
      : null,
  ]);

  const baseTheme = theme ?? defaultTheme;
  const storefrontTheme = {
    ...baseTheme,
    layout: productConfig?.layoutOverride ?? baseTheme.layout,
    heading: productConfig?.headingOverride ?? baseTheme.heading,
    accentColor: productConfig?.accentColorOverride ?? baseTheme.accentColor,
  };

  if (productConfig?.enabled === false) {
    return json({
      ok: true,
      enabled: false,
      productHandle,
      productId,
      rating: null,
      count: 0,
      reviews: [],
    });
  }

  const reviewWhere = {
    shop,
    productHandle,
    source: publicSource,
    status: "APPROVED",
    ...(rating >= 1 && rating <= 5 ? { rating } : {}),
    ...(mediaOnly
      ? {
          media: {
            some: { status: "APPROVED" },
          },
        }
      : {}),
  };

  const orderBy =
    sort === "NEWEST"
      ? [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "HELPFUL"
        ? [{ helpfulCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ featured: "desc" as const }, { helpfulCount: "desc" as const }, { createdAt: "desc" as const }];

  const [reviews, ratingStats, reviewCount, ratingRows] = await Promise.all([
    prisma.review.findMany({
      where: reviewWhere,
      orderBy,
      take: 50,
      include: {
        media: {
          where: { status: "APPROVED" },
          orderBy: { position: "asc" },
        },
        merchantReply: true,
      },
    }),
    prisma.review.aggregate({
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
      _avg: { rating: true },
    }),
    prisma.review.count({
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
      _count: { _all: true },
    }),
  ]);

  if (
    reviewRequest &&
    reviewRequest.shop === shop &&
    reviewRequest.productHandle === productHandle &&
    !reviewRequest.openedAt
  ) {
    await prisma.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: { openedAt: new Date() },
    });
  }

  const fingerprint = requestFingerprint(request, `widget:${productHandle}`);
  const widgetRate = await rateLimit(`widget:${shop}:${fingerprint}`, 20, 60);
  if (widgetRate.allowed) {
    await prisma.analyticsEvent.create({
      data: {
        shop,
        type: "WIDGET_VIEW",
        productId: productId || null,
        productHandle,
        anonymousId: fingerprint,
        metadata: JSON.stringify({ sort, rating, mediaOnly }),
      },
    });
  }

  const breakdown = Object.fromEntries(
    [1, 2, 3, 4, 5].map((star) => [
      String(star),
      ratingRows.find((row) => row.rating === star)?._count._all ?? 0,
    ]),
  );

  const requestContext =
    reviewRequest &&
    reviewRequest.shop === shop &&
    reviewRequest.productHandle === productHandle &&
    reviewRequest.expiresAt > new Date() &&
    reviewRequest.status !== "COMPLETED"
      ? {
          active: true,
          productTitle: reviewRequest.productTitle,
          verifiedEligible: true,
        }
      : { active: false, verifiedEligible: false };

  return json({
    ok: true,
    enabled: true,
    productHandle,
    productId,
    rating: ratingStats._avg.rating,
    count: reviewCount,
    ratingBreakdown: breakdown,
    theme: storefrontTheme,
    collection: {
      ...(collection ?? defaultCollection),
      mediaUploadEnabled: mediaUploadEnabled(),
    },
    requestContext,
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      reviewerName: review.reviewerName,
      verifiedPurchase: review.verifiedPurchase,
      helpfulCount: review.helpfulCount,
      featured: review.featured,
      variantTitle: review.variantTitle,
      createdAt: review.createdAt.toISOString(),
      media: review.media.map((media) => ({
        type: media.type,
        url: media.url,
        altText: media.altText,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
      })),
      merchantReply:
        storefrontTheme.showMerchantReplies && review.merchantReply
          ? {
              body: review.merchantReply.body,
              merchantName: review.merchantReply.merchantName,
            }
          : null,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return json({ ok: false, error: "App session unavailable." }, { status: 401 });
  }

  const shop = session.shop;
  const contentType = request.headers.get("content-type") ?? "";
  const payload =
    contentType.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries(await request.formData());

  const intent = stringValue(payload.intent, 60);

  if (intent === "sign_media_upload") {
    const fingerprint = requestFingerprint(request, "media-upload");
    const limit = await rateLimit(`media:${shop}:${fingerprint}`, 12, 60 * 60);
    if (!limit.allowed) {
      return json({ ok: false, error: "Too many upload attempts. Try again later." }, { status: 429 });
    }

    try {
      const signature = await createMediaUploadSignature({
        shop,
        mimeType: stringValue(payload.mimeType, 100),
        bytes: numberValue(payload.bytes),
      });
      return json({ ok: true, ...signature });
    } catch (error) {
      return json(
        { ok: false, error: error instanceof Error ? error.message : "Unable to prepare upload." },
        { status: 400 },
      );
    }
  }

  if (intent === "helpful") {
    const reviewId = stringValue(payload.reviewId, 200);
    if (!reviewId) {
      return json({ ok: false, error: "Missing review." }, { status: 400 });
    }

    const fingerprint = requestFingerprint(request, `helpful:${reviewId}`);

    try {
      await prisma.$transaction(async (tx) => {
        const review = await tx.review.findFirst({
          where: {
            id: reviewId,
            shop,
            source: publicSource,
            status: "APPROVED",
          },
          select: { id: true, productId: true, productHandle: true },
        });
        if (!review) throw new Error("NOT_FOUND");

        await tx.helpfulVote.create({
          data: { reviewId, fingerprint },
        });

        await tx.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { increment: 1 } },
        });

        await tx.analyticsEvent.create({
          data: {
            shop,
            type: "HELPFUL_VOTE",
            reviewId,
            productId: review.productId,
            productHandle: review.productHandle,
            anonymousId: fingerprint,
          },
        });
      });

      return json({ ok: true });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") {
        return json({ ok: true, alreadyVoted: true });
      }
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return json({ ok: false, error: "Review not found." }, { status: 404 });
      }
      throw error;
    }
  }

  if (intent === "track_event") {
    const type = stringValue(payload.type, 80);
    const allowed = new Set([
      "FEED_OPEN",
      "FILTER_CHANGED",
      "MEDIA_OPEN",
      "MEDIA_PLAY",
      "REVIEW_FORM_OPEN",
      "REVIEW_FORM_STARTED",
      "SHARE_CLICK",
    ]);

    if (!allowed.has(type)) {
      return json({ ok: false, error: "Unsupported analytics event." }, { status: 400 });
    }

    const fingerprint = requestFingerprint(request, `event:${type}`);
    const limit = await rateLimit(`event:${shop}:${fingerprint}`, 120, 60);
    if (!limit.allowed) return json({ ok: true, throttled: true });

    const rawMetadata = stringValue(payload.metadata, 2000);
    await prisma.analyticsEvent.create({
      data: {
        shop,
        type,
        productId: stringValue(payload.productId, 200) || null,
        productHandle: stringValue(payload.productHandle, 255) || null,
        reviewId: stringValue(payload.reviewId, 200) || null,
        anonymousId: fingerprint,
        metadata: rawMetadata || null,
      },
    });
    return json({ ok: true });
  }

  if (intent === "submit_review") {
    const fingerprint = requestFingerprint(request, "review-submit");
    const limit = await rateLimit(`submit:${shop}:${fingerprint}`, 5, 60 * 60);
    if (!limit.allowed) {
      return json(
        { ok: false, error: "Too many review submissions. Please try again later." },
        { status: 429 },
      );
    }

    const productId = stringValue(payload.productId, 200);
    const productHandle = stringValue(payload.productHandle, 255);
    const productTitle = stringValue(payload.productTitle, 255);
    const variantId = stringValue(payload.variantId, 200);
    const variantTitle = stringValue(payload.variantTitle, 255);
    const reviewerName = stringValue(payload.reviewerName, MAX_REVIEWER_NAME_LENGTH);
    const reviewerEmail = normalizeEmail(stringValue(payload.reviewerEmail, 320));
    const title = stringValue(payload.title, MAX_REVIEW_TITLE_LENGTH);
    const body = stringValue(payload.body, MAX_REVIEW_BODY_LENGTH);
    const rating = numberValue(payload.rating);
    const requestToken = stringValue(payload.requestToken, 500);
    const mediaItems = parseMedia(payload.media);

    const settings =
      (await prisma.collectionSettings.findUnique({ where: { shop } })) ??
      defaultCollection;

    if (!productHandle || !reviewerName) {
      return json(
        { ok: false, error: "Product and reviewer name are required." },
        { status: 400 },
      );
    }

    if (
      settings.collectRating &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      return json({ ok: false, error: "Choose a rating from 1 to 5." }, { status: 400 });
    }

    if (settings.collectBody && !body) {
      return json({ ok: false, error: "Review text is required." }, { status: 400 });
    }

    if (settings.requireEmail && !reviewerEmail) {
      return json({ ok: false, error: "Email is required." }, { status: 400 });
    }

    const maxMedia = Math.min(
      MAX_MEDIA_ITEMS,
      Math.max(0, settings.maxMediaItems || 0),
    );
    if (mediaItems.length > maxMedia) {
      return json({ ok: false, error: `Upload up to ${maxMedia} media items.` }, { status: 400 });
    }

    const spam = scoreReviewSpam({ reviewerName, title, body });
    const emailHash = reviewerEmail ? hashValue(reviewerEmail) : null;

    let reviewRequest = null;
    if (requestToken) {
      reviewRequest = await prisma.reviewRequest.findUnique({
        where: { tokenHash: hashValue(requestToken) },
      });
    }

    const verifiedFromRequest = Boolean(
      settings.autoVerifyOrders &&
      reviewRequest &&
        reviewRequest.shop === shop &&
        reviewRequest.productHandle === productHandle &&
        reviewRequest.expiresAt > new Date() &&
        reviewRequest.status !== "COMPLETED" &&
        (!emailHash || reviewRequest.emailHash === emailHash),
    );

    const autoApprove =
      settings.autoApproveFiveStar &&
      rating === 5 &&
      spam.score < 50;

    const initialStatus = spam.score >= 75
      ? "SPAM"
      : autoApprove
        ? "APPROVED"
        : "PENDING";

    const review = await prisma.review.create({
      data: {
        shop,
        productId: productId || `shopify-product:${productHandle}`,
        productHandle,
        productTitle: productTitle || null,
        variantId: variantId || null,
        variantTitle: variantTitle || null,
        orderId: verifiedFromRequest ? reviewRequest?.orderId ?? null : null,
        reviewRequestId: verifiedFromRequest ? reviewRequest?.id ?? null : null,
        rating: settings.collectRating ? rating : 5,
        title: settings.collectTitle ? title || null : null,
        body: settings.collectBody ? body : "",
        reviewerName,
        reviewerEmail: settings.collectEmail ? reviewerEmail || null : null,
        reviewerEmailHash: emailHash,
        verifiedPurchase: verifiedFromRequest,
        verifiedAt: verifiedFromRequest ? new Date() : null,
        status: initialStatus,
        source: "CUSTOMER",
        publishedAt: initialStatus === "APPROVED" ? new Date() : null,
        spamScore: spam.score,
        spamReason: spam.reason,
        ipHash: fingerprint,
      },
    });

    try {
      for (let index = 0; index < mediaItems.length; index += 1) {
        const item = mediaItems[index];
        if (
          !item?.uploadToken ||
          !item.publicId ||
          !item.secureUrl
        ) {
          continue;
        }

        const media = await consumeMediaUpload({
          shop,
          uploadToken: item.uploadToken,
          publicId: item.publicId,
          secureUrl: item.secureUrl,
          bytes: item.bytes,
          width: item.width,
          height: item.height,
          durationMs: item.durationMs,
        });

        await prisma.reviewMedia.create({
          data: {
            reviewId: review.id,
            type: media.type,
            url: media.url,
            publicId: media.publicId,
            altText: stringValue(item.altText, 300) || null,
            position: index,
            status: initialStatus === "APPROVED" ? "APPROVED" : "PENDING",
            bytes: media.bytes,
            width: media.width,
            height: media.height,
            durationMs: media.durationMs,
          },
        });
      }
    } catch (error) {
      await prisma.review.delete({ where: { id: review.id } });
      return json(
        { ok: false, error: error instanceof Error ? error.message : "Unable to attach media." },
        { status: 400 },
      );
    }

    if (verifiedFromRequest && reviewRequest) {
      await prisma.reviewRequest.update({
        where: { id: reviewRequest.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    await prisma.analyticsEvent.create({
      data: {
        shop,
        type: "REVIEW_SUBMITTED",
        productId: review.productId,
        productHandle,
        reviewId: review.id,
        anonymousId: fingerprint,
        metadata: JSON.stringify({
          autoApproved: initialStatus === "APPROVED",
          verifiedPurchase: verifiedFromRequest,
          mediaCount: mediaItems.length,
          spamScore: spam.score,
        }),
      },
    });

    return json({
      ok: true,
      status: review.status,
      verifiedPurchase: review.verifiedPurchase,
      message:
        review.status === "APPROVED"
          ? "Thanks! Your review is live."
          : review.status === "SPAM"
            ? "Thanks! Your review was received for moderation."
            : "Thanks! Your review was submitted for moderation.",
    });
  }

  return json({ ok: false, error: "Unknown action." }, { status: 400 });
};
