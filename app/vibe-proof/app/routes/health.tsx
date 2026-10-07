import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const verbose =
    process.env.HEALTHCHECK_SECRET &&
    url.searchParams.get("key") === process.env.HEALTHCHECK_SECRET;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      {
        ok: true,
        service: "vibeproof",
        database: "ok",
        ...(verbose
          ? {
              media: Boolean(
                process.env.CLOUDINARY_CLOUD_NAME &&
                  process.env.CLOUDINARY_API_KEY &&
                  process.env.CLOUDINARY_API_SECRET,
              ),
              email: Boolean(
                process.env.RESEND_API_KEY && process.env.REVIEW_EMAIL_FROM,
              ),
              cron: Boolean(process.env.CRON_SECRET),
            }
          : {}),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      { ok: false, service: "vibeproof", database: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
