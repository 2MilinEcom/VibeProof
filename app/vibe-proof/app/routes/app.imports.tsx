import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { csvValue, parseCsv } from "../lib/csv.server";
import { authenticate } from "../shopify.server";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

function parseBool(value: string) {
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
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
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file." };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, message: "CSV files must be 5 MB or smaller." };
  }

  const job = await prisma.importJob.create({
    data: {
      shop: session.shop,
      filename: file.name.slice(0, 255),
      status: "PROCESSING",
    },
  });

  try {
    const parsed = parseCsv(await file.text());
    const rows = parsed.rows.slice(0, MAX_ROWS);
    const errors: string[] = [];
    const records: Array<{
      shop: string;
      productId: string;
      productHandle: string | null;
      productTitle: string | null;
      variantTitle: string | null;
      rating: number;
      title: string | null;
      body: string;
      reviewerName: string;
      reviewerEmail: string | null;
      verifiedPurchase: boolean;
      status: string;
      source: string;
      publishedAt: Date | null;
      createdAt?: Date;
    }> = [];

    rows.forEach((row, index) => {
      const productHandle = csvValue(row, "product_handle", "handle");
      const productId =
        csvValue(row, "product_id") ||
        (productHandle ? `shopify-product:${productHandle}` : "");
      const rating = Number(csvValue(row, "rating", "stars"));
      const body = csvValue(row, "body", "review", "review_body");
      const reviewerName = csvValue(row, "reviewer_name", "name", "author");
      const statusValue = csvValue(row, "status").toUpperCase();
      const status = statusValue === "PENDING" ? "PENDING" : "APPROVED";

      if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || !body || !reviewerName) {
        errors.push(`Row ${index + 2}: missing product, valid rating, review body, or reviewer name.`);
        return;
      }

      const createdAtRaw = csvValue(row, "created_at", "date");
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : undefined;
      const validCreatedAt =
        createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;

      records.push({
        shop: session.shop,
        productId,
        productHandle: productHandle || null,
        productTitle: csvValue(row, "product_title") || null,
        variantTitle: csvValue(row, "variant_title", "variant") || null,
        rating,
        title: csvValue(row, "title", "review_title") || null,
        body: body.slice(0, 2000),
        reviewerName: reviewerName.slice(0, 80),
        reviewerEmail: csvValue(row, "reviewer_email", "email") || null,
        verifiedPurchase: parseBool(csvValue(row, "verified_purchase", "verified")),
        status,
        source: "IMPORT",
        publishedAt: status === "APPROVED" ? validCreatedAt ?? new Date() : null,
        ...(validCreatedAt ? { createdAt: validCreatedAt } : {}),
      });
    });

    for (let start = 0; start < records.length; start += 500) {
      await prisma.review.createMany({
        data: records.slice(start, start + 500),
      });
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        totalRows: rows.length,
        importedRows: records.length,
        skippedRows: rows.length - records.length,
        errorsJson: errors.length ? JSON.stringify(errors.slice(0, 100)) : null,
        completedAt: new Date(),
      },
    });

    return {
      ok: true,
      message: `Imported ${records.length} review(s); skipped ${rows.length - records.length}.`,
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorsJson: JSON.stringify([
          error instanceof Error ? error.message : "Unknown import error.",
        ]),
        completedAt: new Date(),
      },
    });
    return { ok: false, message: "Import failed. Check the import history for details." };
  }
};

export default function ImportsPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Imports">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      )}

      <s-section heading="Import review CSV">
        <s-paragraph>
          Import up to 5,000 reviews at a time. Required columns are product_handle
          or product_id, rating, body, and reviewer_name. Optional columns include
          title, reviewer_email, product_title, variant_title, verified_purchase,
          status, and created_at.
        </s-paragraph>

        <Form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <input type="file" name="file" accept=".csv,text/csv" required />
            <s-button type="submit" variant="primary">Import CSV</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Import behavior">
        <s-paragraph>
          Imported reviews use source IMPORT. Status defaults to APPROVED unless a
          row explicitly says PENDING. AI demo content is never created by imports,
          and imports never create Verified purchase status unless the CSV explicitly
          marks the row as verified.
        </s-paragraph>
      </s-section>

      <s-section heading="Import history" padding="none">
        {jobs.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No imports yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>File</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Rows</s-table-header>
              <s-table-header format="numeric">Imported</s-table-header>
              <s-table-header format="numeric">Skipped</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.filename}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "critical" : "info"}>
                      {job.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{String(job.totalRows)}</s-table-cell>
                  <s-table-cell>{String(job.importedRows)}</s-table-cell>
                  <s-table-cell>{String(job.skippedRows)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
