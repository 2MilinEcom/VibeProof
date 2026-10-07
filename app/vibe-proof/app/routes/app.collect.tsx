import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { mediaUploadEnabled } from "../lib/media.server";
import { reviewEmailEnabled } from "../lib/email.server";

const defaultSettings = {
  collectRating: true,
  collectTitle: true,
  collectBody: true,
  collectEmail: true,
  collectPhoto: true,
  collectVideo: true,
  requireEmail: true,
  autoApproveFiveStar: false,
  maxMediaItems: 4,
  enablePostPurchaseRequests: true,
  requestDelayDays: 7,
  reminderDelayDays: 5,
  maxReminders: 1,
  autoVerifyOrders: true,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, pendingRequests, sentRequests, completedRequests] =
    await Promise.all([
      prisma.collectionSettings.findUnique({
        where: { shop: session.shop },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "PENDING" },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "SENT" },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "COMPLETED" },
      }),
    ]);

  return {
    settings: settings ?? defaultSettings,
    integrations: {
      media: mediaUploadEnabled(),
      email: reviewEmailEnabled(),
    },
    requests: {
      pending: pendingRequests,
      sent: sentRequests,
      completed: completedRequests,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const clamp = (value: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(max, Math.max(min, Math.round(number)))
      : fallback;
  };

  const data = {
    collectRating: formData.has("collectRating"),
    collectTitle: formData.has("collectTitle"),
    collectBody: formData.has("collectBody"),
    collectEmail: formData.has("collectEmail"),
    collectPhoto: formData.has("collectPhoto"),
    collectVideo: formData.has("collectVideo"),
    requireEmail: formData.has("requireEmail"),
    autoApproveFiveStar: formData.has("autoApproveFiveStar"),
    maxMediaItems: clamp(formData.get("maxMediaItems"), 0, 6, 4),
    enablePostPurchaseRequests: formData.has("enablePostPurchaseRequests"),
    requestDelayDays: clamp(formData.get("requestDelayDays"), 0, 30, 7),
    reminderDelayDays: clamp(formData.get("reminderDelayDays"), 1, 30, 5),
    maxReminders: clamp(formData.get("maxReminders"), 0, 3, 1),
    autoVerifyOrders: formData.has("autoVerifyOrders"),
  };

  await prisma.collectionSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { ok: true, message: "Collection settings saved." };
};

export default function CollectPage() {
  const { settings, integrations, requests } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Collect">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      )}

      <s-section heading="Collection readiness">
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-badge tone={integrations.media ? "success" : "warning"}>
                {integrations.media ? "Media ready" : "Media setup needed"}
              </s-badge>
              <s-text>
                {integrations.media
                  ? "Photo and video uploads are enabled."
                  : "Add Cloudinary credentials before accepting customer media."}
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-badge tone={integrations.email ? "success" : "warning"}>
                {integrations.email ? "Email ready" : "Email setup needed"}
              </s-badge>
              <s-text>
                {integrations.email
                  ? "Post-purchase review requests can be delivered."
                  : "Add Resend credentials before sending review requests."}
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text>Review requests</s-text>
              <s-text>
                {String(requests.pending)} pending · {String(requests.sent)} sent ·{" "}
                {String(requests.completed)} completed
              </s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Storefront review form">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-checkbox
              label="Star rating"
              name="collectRating"
              value="on"
              defaultChecked={settings.collectRating}
            ></s-checkbox>
            <s-checkbox
              label="Review title"
              name="collectTitle"
              value="on"
              defaultChecked={settings.collectTitle}
            ></s-checkbox>
            <s-checkbox
              label="Written review"
              name="collectBody"
              value="on"
              defaultChecked={settings.collectBody}
            ></s-checkbox>
            <s-checkbox
              label="Customer email"
              name="collectEmail"
              value="on"
              defaultChecked={settings.collectEmail}
            ></s-checkbox>
            <s-checkbox
              label="Require email"
              name="requireEmail"
              value="on"
              defaultChecked={settings.requireEmail}
            ></s-checkbox>
            <s-checkbox
              label="Photo reviews"
              name="collectPhoto"
              value="on"
              defaultChecked={settings.collectPhoto}
              details="Images are limited to 10 MB each."
            ></s-checkbox>
            <s-checkbox
              label="Video reviews"
              name="collectVideo"
              value="on"
              defaultChecked={settings.collectVideo}
              details="Videos are limited to 50 MB each."
            ></s-checkbox>
            <s-number-field
              label="Maximum media items per review"
              name="maxMediaItems"
              min={0}
              max={6}
              step={1}
              defaultValue={String(settings.maxMediaItems)}
            ></s-number-field>
            <s-checkbox
              label="Auto-approve clean 5-star reviews"
              name="autoApproveFiveStar"
              value="on"
              defaultChecked={settings.autoApproveFiveStar}
              details="Spam-scored submissions still stay out of the public feed."
            ></s-checkbox>

            <s-divider></s-divider>
            <s-heading>Post-purchase requests</s-heading>

            <s-checkbox
              label="Send post-purchase review requests"
              name="enablePostPurchaseRequests"
              value="on"
              defaultChecked={settings.enablePostPurchaseRequests}
              details="Requests are queued when Shopify reports an order fulfilled."
            ></s-checkbox>
            <s-checkbox
              label="Verify purchases from signed review-request links"
              name="autoVerifyOrders"
              value="on"
              defaultChecked={settings.autoVerifyOrders}
            ></s-checkbox>

            <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
              <s-number-field
                label="Days after fulfillment"
                name="requestDelayDays"
                min={0}
                max={30}
                step={1}
                defaultValue={String(settings.requestDelayDays)}
              ></s-number-field>
              <s-number-field
                label="Days before reminder"
                name="reminderDelayDays"
                min={1}
                max={30}
                step={1}
                defaultValue={String(settings.reminderDelayDays)}
              ></s-number-field>
              <s-number-field
                label="Maximum reminders"
                name="maxReminders"
                min={0}
                max={3}
                step={1}
                defaultValue={String(settings.maxReminders)}
              ></s-number-field>
            </s-grid>

            <s-button type="submit" variant="primary">
              Save collection settings
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Verified purchase rules">
        <s-paragraph>
          A storefront review is marked verified only when it arrives through an
          unexpired, signed post-purchase request that matches the store, product,
          and purchaser email. Imported verification remains explicitly tagged as
          merchant-provided import data.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
