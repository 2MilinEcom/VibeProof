import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const requests = await prisma.privacyRequest.findMany({
    where: { shop: session.shop },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return {
    requests: requests.map((item) => ({
      id: item.id,
      topic: item.topic,
      requestId: item.requestId,
      status: item.status,
      summary: item.summary,
      receivedAt: item.receivedAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const id = String(formData.get("id") || "");

  const item = await prisma.privacyRequest.findFirst({
    where: { id, shop: session.shop },
    select: { id: true },
  });
  if (!item) return { ok: false };

  await prisma.privacyRequest.update({
    where: { id: item.id },
    data: { status: "DELIVERED", completedAt: new Date() },
  });

  return { ok: true };
};

export default function PrivacyPage() {
  const { requests } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Privacy requests">
      <s-section heading="Compliance center">
        <s-paragraph>
          VibeProof accepts Shopify&apos;s mandatory customer data request,
          customer redaction, and shop redaction webhooks. Data export requests
          are prepared here so the merchant can deliver them to the requester.
        </s-paragraph>
      </s-section>

      <s-section heading="Requests" padding="none">
        {requests.length === 0 ? (
          <s-box padding="base">
            <s-text color="subdued">No privacy requests received.</s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Topic</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Received</s-table-header>
              <s-table-header>Details</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {requests.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>{item.topic.replaceAll("_", " ")}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={item.status === "DELIVERED" || item.status === "COMPLETED" ? "success" : "warning"}>
                      {item.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{new Date(item.receivedAt).toLocaleDateString()}</s-table-cell>
                  <s-table-cell>
                    <s-text>{item.summary ? item.summary.slice(0, 180) : "No export payload retained."}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {item.status === "READY" ? (
                      <Form method="post">
                        <input type="hidden" name="id" value={item.id} />
                        <s-button type="submit" variant="secondary">Mark delivered</s-button>
                      </Form>
                    ) : (
                      <s-text color="subdued">Complete</s-text>
                    )}
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
