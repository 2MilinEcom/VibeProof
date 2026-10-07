import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { hashValue } from "../lib/security.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const existingStatus = url.searchParams.get("status");
  if (existingStatus === "success" || existingStatus === "invalid") {
    return { status: existingStatus };
  }

  const token = url.searchParams.get("token")?.trim() || "";
  if (!token) return { status: "invalid" as const };

  const reviewRequest = await prisma.reviewRequest.findUnique({
    where: { tokenHash: hashValue(token) },
  });
  if (!reviewRequest) return { status: "invalid" as const };

  await prisma.$transaction([
    prisma.emailSuppression.upsert({
      where: {
        shop_emailHash: {
          shop: reviewRequest.shop,
          emailHash: reviewRequest.emailHash,
        },
      },
      create: {
        shop: reviewRequest.shop,
        emailHash: reviewRequest.emailHash,
      },
      update: { reason: "UNSUBSCRIBED" },
    }),
    prisma.reviewRequest.updateMany({
      where: {
        shop: reviewRequest.shop,
        emailHash: reviewRequest.emailHash,
        status: { in: ["PENDING", "SENT"] },
      },
      data: { status: "CANCELLED" },
    }),
  ]);

  return { status: "success" as const };
};

export default function ReviewUnsubscribe() {
  const { status } = useLoaderData<typeof loader>();

  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>VibeProof review requests</h1>
      {status === "success" ? (
        <p>You won&apos;t receive additional VibeProof review-request emails from this store.</p>
      ) : (
        <p>This unsubscribe link is invalid or has expired.</p>
      )}
    </main>
  );
}
