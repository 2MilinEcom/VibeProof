import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const publicSource = { notIn: ["AI_DEMO", "TEST"] };

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
  autoMatch: true,
};

const defaultCollection = {
  collectRating: true,
  collectTitle: true,
  collectBody: true,
  collectEmail: true,
  collectPhoto: true,
  collectVideo: false,
  requireEmail: true,
  autoApproveFiveStar: false,
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
    ...init,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productHandle = url.searchParams.get("product_handle")?.trim() ?? "";
  const productId = url.searchParams.get("product_id")?.trim() ?? "";

  if (!shop || !productHandle) {
    return json(
      { ok: false, error: "Missing shop or product handle." },
      { status: 400 },
    );
  }

  const [theme, productConfig, collection, reviews, ratingStats, reviewCount] =
    await Promise.all([
      prisma.widgetTheme.findUnique({
        where: { shop },
      }),
      prisma.productConfig.findFirst({
        where: {
          shop,
          productHandle,
        },
      }),
      prisma.collectionSettings.findUnique({
        where: { shop },
      }),
      prisma.review.findMany({
        where: {
          shop,
          productHandle,
          source: publicSource,
          status: "APPROVED",
        },
        orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: {
          media: {
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
    ]);

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

  const baseTheme = theme ?? defaultTheme;
  const storefrontTheme = {
    ...baseTheme,
    layout: productConfig?.layoutOverride ?? baseTheme.layout,
    heading: productConfig?.headingOverride ?? baseTheme.heading,
    accentColor:
      productConfig?.accentColorOverride ?? baseTheme.accentColor,
  };

  await prisma.analyticsEvent.create({
    data: {
      shop,
      type: "WIDGET_VIEW",
      productId: productId || null,
      metadata: JSON.stringify({ productHandle }),
    },
  });

  return json({
    ok: true,
    enabled: true,
    productHandle,
    productId,
    rating: ratingStats._avg.rating,
    count: reviewCount,
    theme: storefrontTheme,
    collection: collection ?? defaultCollection,
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
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ ok: false, error: "Missing shop." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const payload =
    contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());

  const intent =
    typeof payload.intent === "string" ? payload.intent : "";

  if (intent === "helpful") {
    const reviewId =
      typeof payload.reviewId === "string" ? payload.reviewId : "";

    if (!reviewId) {
      return json({ ok: false, error: "Missing review." }, { status: 400 });
    }

    const updated = await prisma.review.updateMany({
      where: {
        id: reviewId,
        shop,
        source: publicSource,
        status: "APPROVED",
      },
      data: {
        helpfulCount: {
          increment: 1,
        },
      },
    });

    if (updated.count !== 1) {
      return json({ ok: false, error: "Review not found." }, { status: 404 });
    }

    await prisma.analyticsEvent.create({
      data: {
        shop,
        type: "HELPFUL_VOTE",
        reviewId,
      },
    });

    return json({ ok: true });
  }

  if (intent === "submit_review") {
    const productId =
      typeof payload.productId === "string" ? payload.productId.trim() : "";
    const productHandle =
      typeof payload.productHandle === "string"
        ? payload.productHandle.trim()
        : "";
    const productTitle =
      typeof payload.productTitle === "string"
        ? payload.productTitle.trim()
        : "";
    const reviewerName =
      typeof payload.reviewerName === "string"
        ? payload.reviewerName.trim()
        : "";
    const reviewerEmail =
      typeof payload.reviewerEmail === "string"
        ? payload.reviewerEmail.trim()
        : "";
    const title =
      typeof payload.title === "string" ? payload.title.trim() : "";
    const body =
      typeof payload.body === "string" ? payload.body.trim() : "";
    const rating = Number(payload.rating);

    const settings =
      (await prisma.collectionSettings.findUnique({
        where: { shop },
      })) ?? defaultCollection;

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
      return json(
        { ok: false, error: "Choose a rating from 1 to 5." },
        { status: 400 },
      );
    }

    if (settings.collectBody && !body) {
      return json(
        { ok: false, error: "Review text is required." },
        { status: 400 },
      );
    }

    if (settings.requireEmail && !reviewerEmail) {
      return json(
        { ok: false, error: "Email is required." },
        { status: 400 },
      );
    }

    const autoApprove =
      settings.autoApproveFiveStar && rating === 5;

    const review = await prisma.review.create({
      data: {
        shop,
        productId: productId || `shopify-product:${productHandle}`,
        productHandle,
        productTitle: productTitle || null,
        rating: settings.collectRating ? rating : 5,
        title: settings.collectTitle ? title || null : null,
        body: settings.collectBody ? body : "",
        reviewerName,
        reviewerEmail: settings.collectEmail ? reviewerEmail || null : null,
        verifiedPurchase: false,
        status: autoApprove ? "APPROVED" : "PENDING",
        source: "CUSTOMER",
        publishedAt: autoApprove ? new Date() : null,
      },
    });

    await prisma.analyticsEvent.create({
      data: {
        shop,
        type: "REVIEW_SUBMITTED",
        productId: review.productId,
        reviewId: review.id,
        metadata: JSON.stringify({
          productHandle,
          autoApproved: autoApprove,
        }),
      },
    });

    return json({
      ok: true,
      status: review.status,
      message:
        review.status === "APPROVED"
          ? "Thanks! Your review is live."
          : "Thanks! Your review was submitted for moderation.",
    });
  }

  return json({ ok: false, error: "Unknown action." }, { status: 400 });
};
