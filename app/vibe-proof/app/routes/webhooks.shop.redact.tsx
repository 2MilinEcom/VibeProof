import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { destroyMediaAssets } from "../lib/media.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  const media = await prisma.reviewMedia.findMany({
    where: { review: { shop } },
    select: { publicId: true, type: true },
  });
  await destroyMediaAssets(media);

  await prisma.$transaction([
    prisma.helpfulVote.deleteMany({ where: { review: { shop } } }),
    prisma.reviewMedia.deleteMany({ where: { review: { shop } } }),
    prisma.merchantReply.deleteMany({ where: { review: { shop } } }),
    prisma.review.deleteMany({ where: { shop } }),
    prisma.reviewRequest.deleteMany({ where: { shop } }),
    prisma.mediaUpload.deleteMany({ where: { shop } }),
    prisma.importJob.deleteMany({ where: { shop } }),
    prisma.emailSuppression.deleteMany({ where: { shop } }),
    prisma.rateLimitBucket.deleteMany({ where: { key: { contains: shop } } }),
    prisma.emailSuppression.deleteMany({ where: { shop } }),
    prisma.analyticsEvent.deleteMany({ where: { shop } }),
    prisma.productConfig.deleteMany({ where: { shop } }),
    prisma.widgetTheme.deleteMany({ where: { shop } }),
    prisma.collectionSettings.deleteMany({ where: { shop } }),
    prisma.shopConfig.deleteMany({ where: { shop } }),
    prisma.privacyRequest.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
