import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await prisma.$transaction([
    prisma.helpfulVote.deleteMany({
      where: { review: { shop } },
    }),
    prisma.reviewMedia.deleteMany({
      where: { review: { shop } },
    }),
    prisma.merchantReply.deleteMany({
      where: { review: { shop } },
    }),
    prisma.review.deleteMany({ where: { shop } }),
    prisma.reviewRequest.deleteMany({ where: { shop } }),
    prisma.mediaUpload.deleteMany({ where: { shop } }),
    prisma.importJob.deleteMany({ where: { shop } }),
    prisma.analyticsEvent.deleteMany({ where: { shop } }),
    prisma.productConfig.deleteMany({ where: { shop } }),
    prisma.widgetTheme.deleteMany({ where: { shop } }),
    prisma.collectionSettings.deleteMany({ where: { shop } }),
    prisma.shopConfig.deleteMany({ where: { shop } }),
    prisma.rateLimitBucket.deleteMany({
      where: { key: { contains: shop } },
    }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  await prisma.privacyRequest.create({
    data: {
      shop,
      topic: "SHOP_REDACT",
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  return new Response();
};
