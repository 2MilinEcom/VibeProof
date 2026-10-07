import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { hashValue, normalizeEmail } from "../lib/security.server";

type Payload = {
  customer?: { email?: string | null };
  orders_to_redact?: Array<string | number>;
  customer?: { id?: string | number; email?: string | null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const body = payload as unknown as Payload;
  const email = normalizeEmail(body.customer?.email || "");
  const emailHash = email ? hashValue(email) : "";

  if (emailHash) {
    await prisma.$transaction([
      prisma.review.deleteMany({
        where: { shop, reviewerEmailHash: emailHash },
      }),
      prisma.reviewRequest.deleteMany({
        where: { shop, emailHash },
      }),
    ]);
  }

  await prisma.privacyRequest.create({
    data: {
      shop,
      topic: "CUSTOMERS_REDACT",
      requestId: body.customer?.id ? String(body.customer.id) : null,
      status: "COMPLETED",
      summary: JSON.stringify({
        ordersToRedact: body.orders_to_redact ?? [],
        emailHash: emailHash || null,
      }),
      completedAt: new Date(),
    },
  });

  return new Response();
};
