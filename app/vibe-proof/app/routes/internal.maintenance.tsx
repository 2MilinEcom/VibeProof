import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET || "";
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const rateLimitBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const uploadBefore = now;

  const shops = await prisma.shopConfig.findMany({
    select: { shop: true, retentionDays: true },
  });

  let analyticsDeleted = 0;
  for (const config of shops) {
    const cutoff = new Date(
      now.getTime() - config.retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await prisma.analyticsEvent.deleteMany({
      where: { shop: config.shop, createdAt: { lt: cutoff } },
    });
    analyticsDeleted += result.count;
  }

  const [rateLimits, uploads, requests] = await prisma.$transaction([
    prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: rateLimitBefore } },
    }),
    prisma.mediaUpload.deleteMany({
      where: { expiresAt: { lt: uploadBefore } },
    }),
    prisma.reviewRequest.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { in: ["PENDING", "SENT"] },
      },
      data: { status: "EXPIRED" },
    }),
  ]);

  return Response.json({
    ok: true,
    analyticsDeleted,
    rateLimitsDeleted: rateLimits.count,
    uploadTokensDeleted: uploads.count,
    reviewRequestsExpired: requests.count,
  });
};
