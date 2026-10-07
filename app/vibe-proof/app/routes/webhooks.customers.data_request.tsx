import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { hashValue, normalizeEmail } from "../lib/security.server";

type Payload = {
  data_request?: { id?: string | number };
  customer?: { email?: string | null };
  orders_requested?: Array<string | number>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const body = payload as unknown as Payload;
  const email = normalizeEmail(body.customer?.email || "");
  const emailHash = email ? hashValue(email) : "";

  const [reviews, reviewRequests] = emailHash
    ? await Promise.all([
        prisma.review.findMany({
          where: { shop, reviewerEmailHash: emailHash },
          select: {
            id: true,
            productTitle: true,
            rating: true,
            title: true,
            body: true,
            createdAt: true,
            status: true,
          },
          take: 500,
        }),
        prisma.reviewRequest.findMany({
          where: { shop, emailHash },
          select: {
            id: true,
            productTitle: true,
            orderId: true,
            status: true,
            createdAt: true,
          },
          take: 500,
        }),
      ])
    : [[], []];

  await prisma.privacyRequest.create({
    data: {
      shop,
      topic: "CUSTOMERS_DATA_REQUEST",
      requestId: body.data_request?.id ? String(body.data_request.id) : null,
      status: "READY",
      summary: JSON.stringify({
        email,
        ordersRequested: body.orders_requested ?? [],
        reviews,
        reviewRequests,
      }),
      completedAt: new Date(),
    },
  });

  return new Response();
};
