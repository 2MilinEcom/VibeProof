import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { aiProviderEnabled } from "../lib/ai.server";
import { reviewEmailEnabled } from "../lib/email.server";
import { mediaUploadEnabled } from "../lib/media.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await prisma.shopConfig.findUnique({
    where: { shop: session.shop },
  });

  return {
    config: config ?? {
      onboardingComplete: false,
      planHandle: null,
      emailRequestsEnabled: true,
      aiEnabled: true,
      mediaEnabled: true,
      retentionDays: 730,
    },
    readiness: {
      database: Boolean(process.env.DATABASE_URL),
      media: mediaUploadEnabled(),
      email: reviewEmailEnabled(),
      ai: aiProviderEnabled(),
      cron: Boolean(process.env.CRON_SECRET),
      appUrl: Boolean(
        process.env.SHOPIFY_APP_URL &&
          !process.env.SHOPIFY_APP_URL.includes("example.com"),
      ),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const retentionValue = Number(formData.get("retentionDays") || 730);
  const retentionDays = Number.isFinite(retentionValue)
    ? Math.max(30, Math.min(3650, Math.round(retentionValue)))
    : 730;

  const data = {
    onboardingComplete: formData.has("onboardingComplete"),
    emailRequestsEnabled: formData.has("emailRequestsEnabled"),
    aiEnabled: formData.has("aiEnabled"),
    mediaEnabled: formData.has("mediaEnabled"),
    retentionDays,
    planHandle: String(formData.get("planHandle") || "").trim() || null,
  };

  await prisma.shopConfig.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { ok: true, message: "Settings saved." };
};

export default function SettingsPage() {
  const { config, readiness } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const requiredReady =
    readiness.database &&
    readiness.media &&
    readiness.email &&
    readiness.cron &&
    readiness.appUrl;

  return (
    <s-page heading="Settings">
      {actionData?.message && (
        <s-banner tone="success">{actionData.message}</s-banner>
      )}

      <s-section heading="Launch readiness">
        <s-stack direction="block" gap="base">
          <s-badge tone={requiredReady ? "success" : "warning"}>
            {requiredReady ? "Production services ready" : "Production setup incomplete"}
          </s-badge>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            {[
              ["PostgreSQL", readiness.database, true],
              ["Media storage", readiness.media, true],
              ["Review email", readiness.email, true],
              ["Cron secret", readiness.cron, true],
              ["Production app URL", readiness.appUrl, true],
              ["AI provider", readiness.ai, false],
            ].map(([label, ready, required]) => (
              <s-box key={String(label)} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-badge tone={ready ? "success" : required ? "warning" : "neutral"}>
                    {ready ? "Ready" : required ? "Required" : "Optional"}
                  </s-badge>
                  <s-text>{String(label)}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
        </s-stack>
      </s-section>

      <s-section heading="Merchant settings">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-checkbox
              label="Onboarding complete"
              name="onboardingComplete"
              value="on"
              defaultChecked={config.onboardingComplete}
            ></s-checkbox>
            <s-checkbox
              label="Enable post-purchase email delivery"
              name="emailRequestsEnabled"
              value="on"
              defaultChecked={config.emailRequestsEnabled}
            ></s-checkbox>
            <s-checkbox
              label="Enable customer media"
              name="mediaEnabled"
              value="on"
              defaultChecked={config.mediaEnabled}
            ></s-checkbox>
            <s-checkbox
              label="Enable AI features"
              name="aiEnabled"
              value="on"
              defaultChecked={config.aiEnabled}
            ></s-checkbox>
            <s-number-field
              label="Analytics retention days"
              name="retentionDays"
              min={30}
              max={3650}
              step={1}
              defaultValue={String(config.retentionDays)}
            ></s-number-field>
            <s-text-field
              label="Shopify App Pricing plan handle"
              name="planHandle"
              defaultValue={config.planHandle ?? ""}
              placeholder="Optional; managed in Partner Dashboard"
            ></s-text-field>
            <s-button type="submit" variant="primary">Save settings</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Billing">
        <s-paragraph>
          VibeProof is prepared for Shopify App Pricing. Public plan names,
          prices, free trials, and merchant billing are configured in the Shopify
          Partner Dashboard rather than by creating recurring charges in app code.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
