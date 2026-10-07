import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  encryptSecret,
  hashValue,
  normalizeEmail,
  randomToken,
} from "../lib/security.server";

type OrderQueryResponse = {
  data?: {
    order?: {
      id: string;
      email?: string | null;
      lineItems: {
        nodes: Array<{
          product?: {
            id: string;
            handle: string;
            title: string;
          } | null;
          variant?: {
            id: string;
            title: string;
          } | null;
        }>;
      };
    } | null;
  };
};

type OrderWebhookPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop } = await authenticate.webhook(request);

  if (!admin) return new Response();

  const settings =
    (await prisma.collectionSettings.findUnique({ where: { shop } })) ??
    {
      enablePostPurchaseRequests: true,
      requestDelayDays: 7,
      reminderDelayDays: 5,
      maxReminders: 1,
      autoVerifyOrders: true,
    };

  const shopConfig = await prisma.shopConfig.findUnique({ where: { shop } });
  if (
    !settings.enablePostPurchaseRequests ||
    shopConfig?.emailRequestsEnabled === false
  ) {
    return new Response();
  }

  const body = payload as unknown as OrderWebhookPayload;
  const orderId =
    body.admin_graphql_api_id ||
    (body.id ? `gid://shopify/Order/${body.id}` : "");

  if (!orderId) return new Response();

  const response = await admin.graphql(
    `#graphql
      query VibeProofOrder($id: ID!) {
        order(id: $id) {
          id
          email
          lineItems(first: 100) {
            nodes {
              product { id handle title }
              variant { id title }
            }
          }
        }
      }
    `,
    { variables: { id: orderId } },
  );

  const result = (await response.json()) as OrderQueryResponse;
  const order = result.data?.order;
  const email = normalizeEmail(order?.email || "");

  if (!order || !email) return new Response();

  const sendAfter = new Date(
    Date.now() + Math.max(0, settings.requestDelayDays) * 24 * 60 * 60 * 1000,
  );
  const expiresAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const emailHash = hashValue(email);

  for (const item of order.lineItems.nodes) {
    if (!item.product) continue;

    const existing = await prisma.reviewRequest.findFirst({
      where: {
        shop,
        orderId: order.id,
        productId: item.product.id,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });

    if (existing) continue;

    const token = randomToken(32);

    await prisma.reviewRequest.create({
      data: {
        shop,
        orderId: order.id,
        productId: item.product.id,
        productHandle: item.product.handle,
        productTitle: item.product.title,
        variantId: item.variant?.id ?? null,
        variantTitle: item.variant?.title ?? null,
        customerEmailCiphertext: encryptSecret(email),
        emailHash,
        tokenHash: hashValue(token),
        tokenCiphertext: encryptSecret(token),
        sendAfter,
        expiresAt,
      },
    });
  }

  return new Response();
};
