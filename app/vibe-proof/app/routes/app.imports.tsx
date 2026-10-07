import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { parseCsv } from "../lib/csv.server";
import { hashValue, normalizeEmail } from "../lib/security.server";

type Row = Record<string, string>;

function value(row: Row, keys: string[]) {
  for (const key of keys) {
    const found = row[key];
    if (found !== undefined && found !== "") return found;
  }
  return "";
}

function providerFields(provider: string) {
  if (provider === "LOOX") {
    return {
      productHandle: ["product_handle", "handle"],
      productTitle: ["product_title", "product"],
      rating: ["rating"],
      title: ["title"],
      body: ["body", "review"],
      reviewerName: ["author", "reviewer_name", "name"],
      reviewerEmail: ["email", "reviewer_email"],
      createdAt: ["created_at", "date"],
      status: ["status"],
      verified: ["verified_purchase", "verified"],
      mediaUrl: ["photo_url", "media_url", "image_url"],
    };
  }
  if (provider === "JUDGEME") {
    return {
      productHandle: ["product_handle", "handle"],
      productTitle: ["product_title"],
      rating: ["rating"],
      title: ["title"],
      body: ["body"],
      reviewerName: ["reviewer_name", "name"],
      reviewerEmail: ["reviewer_email", "email"],
      createdAt: ["created_at"],
      status: ["curated", "status"],
      verified: ["verified", "verified_purchase"],
      mediaUrl: ["picture_urls", "media_url"],
    };
  }
  if (provider === "YOTPO") {
    return {
      productHandle: ["product_handle", "product_slug", "handle"],
      productTitle: ["product_title", "product_name"],
      rating: ["score", "rating"],
      title: ["title"],
      body: ["content", "body"],
      reviewerName: ["display_name", "reviewer_name", "name"],
      reviewerEmail: ["email", "reviewer_email"],
      createdAt: ["created_at", "date"],
      status: ["status"],
      verified: ["verified_buyer", "verified_purchase"],
      mediaUrl: ["image_url", "media_url"],
    };
  }

  return {
    productHandle: ["product_handle", "handle"],
    productTitle: ["product_title", "product"],
    rating: ["rating", "score"],
    title: ["title"],
    body: ["body", "review", "content"],
    reviewerName: ["reviewer_name", "author", "name"],
    reviewerEmail: ["reviewer_email", "email"],
    createdAt: ["created_at", "date"],
    status: ["status"],
    verified: ["verified_purchase", "verified"],
    mediaUrl: ["media_url", "image_url", "photo_url"],
  };
}

function yes(value: string) {
  return ["1", "true", "yes", "y", "verified"].includes(value.trim().toLowerCase());
}

function normalizeStatus(raw: string, fallback: string) {
  const value = raw.trim().toLowerCase();
  if (["approved", "published", "active", "ok", "true"].includes(value)) {
    return "APPROVED";
  }
  if (["rejected", "declined", "false"].includes(value)) return "REJECTED";
  if (["spam"].includes(value)) return "SPAM";
  return fallback;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await prisma.importJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    jobs: jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const provider = String(formData.get("provider") || "CSV").toUpperCase();
  const fallbackStatus = String(formData.get("defaultStatus") || "PENDING");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, message: "CSV files must be 10 MB or smaller." };
  }

  const job = await prisma.importJob.create({
    data: {
      shop: session.shop,
      provider,
      filename: file.name,
    },
  });

  try {
    const csv = await file.text();
    const rows = parseCsv(csv);
    const fields = providerFields(provider);
    let importedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const productHandle = value(row, fields.productHandle).trim();
      const productTitle = value(row, fields.productTitle).trim();
      const body = value(row, fields.body).trim();
      const reviewerName = value(row, fields.reviewerName).trim();
      const email = normalizeEmail(value(row, fields.reviewerEmail));
      const rating = Number(value(row, fields.rating));

      if (
        !productHandle ||
        !body ||
        !reviewerName ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        skippedRows += 1;
        if (errors.length < 25) {
          errors.push(`Row ${index + 2}: missing product handle, reviewer, body, or valid rating.`);
        }
        continue;
      }

      const status = normalizeStatus(
        value(row, fields.status),
        ["APPROVED", "REJECTED", "PENDING"].includes(fallbackStatus)
          ? fallbackStatus
          : "PENDING",
      );
      const createdAtRaw = value(row, fields.createdAt);
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
      const importedVerifiedClaim = yes(value(row, fields.verified));
      const mediaUrl = value(row, fields.mediaUrl).split(/[|;]/)[0]?.trim() || "";

      try {
        const review = await prisma.review.create({
          data: {
            shop: session.shop,
            productId: `import:${productHandle}`,
            productHandle,
            productTitle: productTitle || null,
            rating,
            title: value(row, fields.title).trim().slice(0, 160) || null,
            body: body.slice(0, 5000),
            reviewerName: reviewerName.slice(0, 120),
            reviewerEmail: email || null,
            reviewerEmailHash: email ? hashValue(email) : null,
            verifiedPurchase: false,
            verifiedAt: null,
            moderationNotes: importedVerifiedClaim
              ? "Import claimed verification; VibeProof did not independently verify this purchase."
              : null,
            status,
            source: "MERCHANT_IMPORT",
            publishedAt: status === "APPROVED" ? createdAt : null,
            createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
          },
        });

        if (mediaUrl) {
          try {
            const url = new URL(mediaUrl);
            if (url.protocol === "https:") {
              await prisma.reviewMedia.create({
                data: {
                  reviewId: review.id,
                  type: /\.(mp4|webm|mov)(\?|$)/i.test(url.pathname)
                    ? "VIDEO"
                    : "IMAGE",
                  url: mediaUrl,
                  position: 0,
                  status: status === "APPROVED" ? "APPROVED" : "PENDING",
                },
              });
            }
          } catch {
            // Invalid optional media URLs are ignored.
          }
        }

        importedRows += 1;
      } catch (error) {
        errorRows += 1;
        if (errors.length < 25) {
          errors.push(
            `Row ${index + 2}: ${error instanceof Error ? error.message : "import failed"}`,
          );
        }
      }
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        totalRows: rows.length,
        importedRows,
        skippedRows,
        errorRows,
        errorSummary: errors.length ? errors.join("\n") : null,
        completedAt: new Date(),
      },
    });

    return {
      ok: true,
      message: `Imported ${importedRows} reviews. Skipped ${skippedRows}; errors ${errorRows}.`,
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorSummary: error instanceof Error ? error.message.slice(0, 3000) : "Import failed.",
        completedAt: new Date(),
      },
    });
    return { ok: false, message: "Import failed. See the job history for details." };
  }
};

export default function ImportsPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Imports">
      <s-section heading="Import reviews">
        <s-paragraph>
          Import a generic VibeProof CSV or exports from Loox, Judge.me, or Yotpo.
          Imported reviews are marked MERCHANT_IMPORT and remain distinct from
          storefront customer submissions.
        </s-paragraph>
        {actionData?.message && <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>}
        <Form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select label="CSV format" name="provider" value="CSV">
                <s-option value="CSV">VibeProof / generic CSV</s-option>
                <s-option value="LOOX">Loox</s-option>
                <s-option value="JUDGEME">Judge.me</s-option>
                <s-option value="YOTPO">Yotpo</s-option>
              </s-select>
              <s-select label="Default moderation status" name="defaultStatus" value="PENDING">
                <s-option value="PENDING">Pending</s-option>
                <s-option value="APPROVED">Approved</s-option>
                <s-option value="REJECTED">Rejected</s-option>
              </s-select>
            </s-grid>
            <label>
              <strong>CSV file</strong>
              <input type="file" name="file" accept=".csv,text/csv" required />
            </label>
            <s-paragraph>
              Generic columns: product_handle, product_title, rating, title, body,
              reviewer_name, reviewer_email, status, verified_purchase, created_at,
              media_url.
            </s-paragraph>
            <s-button type="submit" variant="primary">Import reviews</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Recent imports" padding="none">
        {jobs.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No imports yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">File</s-table-header>
              <s-table-header>Provider</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Imported</s-table-header>
              <s-table-header format="numeric">Skipped</s-table-header>
              <s-table-header format="numeric">Errors</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.filename || "Import"}</s-table-cell>
                  <s-table-cell>{job.provider}</s-table-cell>
                  <s-table-cell>{job.status}</s-table-cell>
                  <s-table-cell>{String(job.importedRows)}</s-table-cell>
                  <s-table-cell>{String(job.skippedRows)}</s-table-cell>
                  <s-table-cell>{String(job.errorRows)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
