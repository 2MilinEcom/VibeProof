import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.$transaction([
    db.analyticsEvent.deleteMany({ where: { shop } }),
    db.productConfig.deleteMany({ where: { shop } }),
    db.widgetTheme.deleteMany({ where: { shop } }),
    db.collectionSettings.deleteMany({ where: { shop } }),
    db.review.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
