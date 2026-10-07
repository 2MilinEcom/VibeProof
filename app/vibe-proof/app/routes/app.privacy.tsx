import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const downloadId = url.searchParams.get("download");

  if (downloadId) {
    const item = await prisma.privacyRequest.findFirst({
      where: { id: downloadId, shop: session.shop },
    });
    if (!item) throw new Response("Not found", { status: 404 });
    return new Response(item.payloadJson || "{}", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vibeproof-data-request-${item.requestId}.json"`,
      },
    });
  }

  const requests = await prisma.privacyRequest.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    requests: requests.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") || "");
  if (!requestId) return { ok: false, message: "Missing privacy request." };

  const result = await prisma.privacyRequest.updateMany({
    where: { id: requestId, shop: session.shop },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return result.count
    ? { ok: true, message: "Privacy request marked completed." }
    : { ok: false, message: "Privacy request not found." };
};

export default function PrivacyPage() {
  const { requests } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Privacy">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
      )}

      <s-section heading="Shopify privacy requests">
        <s-paragraph>
          VibeProof records customer data requests so the merchant can provide the
          requested review data. Customer and shop redaction webhooks delete matching
          VibeProof data and stored media automatically.
        </s-paragraph>
      </s-section>

      <s-section heading="Data requests" padding="none">
        {requests.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No pending or historical data requests.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Request</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {requests.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>{item.requestId}</s-table-cell>
                  <s-table-cell>{item.customerEmail ?? "—"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={item.status === "COMPLETED" ? "success" : "warning"}>{item.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-link href={`/app/privacy?download=${encodeURIComponent(item.id)}`}>Download JSON</s-link>
                      {item.status !== "COMPLETED" && (
                        <Form method="post">
                          <input type="hidden" name="requestId" value={item.id} />
                          <s-button type="submit" variant="secondary">Mark completed</s-button>
                        </Form>
                      )}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
