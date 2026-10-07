import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { sendReviewRequestEmail } from "../lib/email.server";
import { decryptSecret } from "../lib/security.server";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET || "";
  const header = request.headers.get("authorization") || "";
  return Boolean(expected && header === `Bearer ${expected}`);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const requests = await prisma.reviewRequest.findMany({
    where: {
      expiresAt: { gt: now },
      OR: [
        { status: "PENDING", sendAfter: { lte: now } },
        { status: "SENT" },
      ],
    },
    orderBy: { sendAfter: "asc" },
    take: 100,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of requests) {
    const settings =
      (await prisma.collectionSettings.findUnique({
        where: { shop: item.shop },
      })) ?? {
        reminderDelayDays: 5,
        maxReminders: 1,
      };

    const [shopConfig, suppression] = await Promise.all([
      prisma.shopConfig.findUnique({ where: { shop: item.shop } }),
      prisma.emailSuppression.findUnique({
        where: {
          shop_emailHash: {
            shop: item.shop,
            emailHash: item.emailHash,
          },
        },
      }),
    ]);

    if (shopConfig?.emailRequestsEnabled === false || suppression) {
      skipped += 1;
      continue;
    }

    const isReminder = item.status === "SENT";
    if (isReminder) {
      if (
        !item.sentAt ||
        item.reminderCount >= settings.maxReminders ||
        item.sentAt.getTime() +
            settings.reminderDelayDays * 24 * 60 * 60 * 1000 >
          now.getTime()
      ) {
        skipped += 1;
        continue;
      }
    }

    if (!item.productHandle) {
      failed += 1;
      await prisma.reviewRequest.update({
        where: { id: item.id },
        data: { lastError: "Missing product handle." },
      });
      continue;
    }

    const token = decryptSecret(item.tokenCiphertext);
    const reviewUrl =
      `https://${item.shop}/products/${encodeURIComponent(item.productHandle)}` +
      `?vibeproof_request=${encodeURIComponent(token)}#vibeproof-review-form`;
    const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    if (!appUrl) {
      failed += 1;
      await prisma.reviewRequest.update({
        where: { id: item.id },
        data: { lastError: "Missing SHOPIFY_APP_URL." },
      });
      continue;
    }
    const unsubscribeUrl =
      `${appUrl}/review-unsubscribe?token=${encodeURIComponent(token)}`;

    try {
      await sendReviewRequestEmail({
        to: item.customerEmail,
        shop: item.shop,
        productTitle: item.productTitle || "your purchase",
        reviewUrl,
        unsubscribeUrl,
        reminder: isReminder,
      });

      await prisma.reviewRequest.update({
        where: { id: item.id },
        data: {
          status: "SENT",
          sentAt: isReminder ? item.sentAt : now,
          reminderCount: isReminder
            ? { increment: 1 }
            : item.reminderCount,
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await prisma.reviewRequest.update({
        where: { id: item.id },
        data: {
          lastError:
            error instanceof Error ? error.message.slice(0, 500) : "Email failed.",
        },
      });
    }
  }

  await prisma.reviewRequest.updateMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ["PENDING", "SENT"] },
    },
    data: { status: "EXPIRED" },
  });

  return Response.json({ ok: true, processed: requests.length, sent, skipped, failed });
};
