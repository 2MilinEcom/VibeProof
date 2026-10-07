import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.$transaction([
    db.helpfulVote.deleteMany({ where: { review: { shop } } }),
    db.reviewMedia.deleteMany({ where: { review: { shop } } }),
    db.merchantReply.deleteMany({ where: { review: { shop } } }),
    db.review.deleteMany({ where: { shop } }),
    db.reviewRequest.deleteMany({ where: { shop } }),
    db.mediaUpload.deleteMany({ where: { shop } }),
    db.importJob.deleteMany({ where: { shop } }),
    db.analyticsEvent.deleteMany({ where: { shop } }),
    db.productConfig.deleteMany({ where: { shop } }),
    db.widgetTheme.deleteMany({ where: { shop } }),
    db.collectionSettings.deleteMany({ where: { shop } }),
    db.shopConfig.deleteMany({ where: { shop } }),
    db.privacyRequest.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
