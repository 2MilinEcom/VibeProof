import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const demoBodies = [
  "The fit feels really flattering and easy to style.",
  "The fabric looks cute in photos and the silhouette is exactly what I wanted.",
  "I love how this looks dressed up or kept casual.",
  "The cut is super fun and the overall look feels very social-ready.",
  "This would be such a good going-out piece.",
  "The shape is really cute and the details stand out in person.",
];

const demoNames = [
  "Mia R.",
  "Ava K.",
  "Nia S.",
  "Sofia T.",
  "Jade M.",
  "Layla C.",
];

const presetMap = {
  SPOILD_NATIVE: {
    accentColor: "#111111",
    backgroundColor: "#FFFFFF",
    textColor: "#111111",
    borderColor: "#E5E7EB",
    heading: "THE GIRLIES SAID IT BEST",
    layout: "SOCIAL_FEED",
  },
  SOFT_GIRL: {
    accentColor: "#D96C9C",
    backgroundColor: "#FFF8FB",
    textColor: "#2A1D24",
    borderColor: "#F1D6E2",
    heading: "LOVE NOTES FROM THE GIRLIES",
    layout: "REVIEW_WALL",
  },
  AFTER_DARK: {
    accentColor: "#FFFFFF",
    backgroundColor: "#111111",
    textColor: "#FFFFFF",
    borderColor: "#333333",
    heading: "THE GIRLIES SAID IT BEST",
    layout: "SPOTLIGHT",
  },
} as const;

type ProductsResponse = {
  data?: {
    products?: {
      nodes?: Array<{
        id: string;
        title: string;
        handle: string;
      }>;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [demoCount, response] = await Promise.all([
    prisma.review.count({
      where: { shop: session.shop, source: "AI_DEMO" },
    }),
    admin.graphql(
      `#graphql
        query VibeProofProducts {
          products(first: 25, sortKey: TITLE) {
            nodes {
              id
              title
              handle
            }
          }
        }`,
    ),
  ]);

  const responseJson = (await response.json()) as ProductsResponse;

  return {
    demoCount,
    products: responseJson.data?.products?.nodes ?? [],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate_demo") {
    const productId = formData.get("productId");
    const productHandle = formData.get("productHandle");
    const productTitle = formData.get("productTitle");
    const requestedCount = Number(formData.get("count") || 6);
    const count = [6, 12, 24].includes(requestedCount) ? requestedCount : 6;

    if (
      typeof productId !== "string" ||
      typeof productHandle !== "string" ||
      typeof productTitle !== "string"
    ) {
      return { ok: false, message: "Choose a product." };
    }

    const batchId = randomUUID();

    await prisma.review.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        shop: session.shop,
        productId,
        productHandle,
        productTitle,
        rating: 4 + (index % 2),
        title: index % 2 === 0 ? "Cute fit" : "Love the look",
        body: demoBodies[index % demoBodies.length],
        reviewerName: demoNames[index % demoNames.length],
        verifiedPurchase: false,
        status: "DEMO",
        source: "AI_DEMO",
        helpfulCount: 0,
        featured: false,
        demoBatchId: batchId,
      })),
    });

    return {
      ok: true,
      message: `Created ${count} AI preview reviews. They are isolated from genuine ratings.`,
    };
  }

  if (intent === "clear_demo") {
    const result = await prisma.review.deleteMany({
      where: {
        shop: session.shop,
        source: "AI_DEMO",
      },
    });

    return {
      ok: true,
      message: `Removed ${result.count} AI preview reviews.`,
    };
  }

  if (intent === "apply_preset") {
    const presetName = formData.get("preset");

    if (
      typeof presetName !== "string" ||
      !(presetName in presetMap)
    ) {
      return { ok: false, message: "Unknown appearance preset." };
    }

    const preset = presetMap[presetName as keyof typeof presetMap];

    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        ...preset,
      },
      update: preset,
    });

    return {
      ok: true,
      message: "Appearance preset applied. Review it in Display before publishing.",
    };
  }

  if (intent === "design_prompt") {
    const prompt = String(formData.get("designPrompt") || "")
      .trim()
      .toLowerCase();

    if (!prompt) {
      return { ok: false, message: "Enter a design direction." };
    }

    const presetName =
      prompt.includes("pink") ||
      prompt.includes("soft") ||
      prompt.includes("girly") ||
      prompt.includes("romantic")
        ? "SOFT_GIRL"
        : prompt.includes("dark") ||
            prompt.includes("black") ||
            prompt.includes("night") ||
            prompt.includes("moody")
          ? "AFTER_DARK"
          : "SPOILD_NATIVE";

    const preset = presetMap[presetName];

    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        ...preset,
      },
      update: preset,
    });

    return {
      ok: true,
      message:
        "Design prompt mapped to constrained VibeProof tokens. Review the result in Display before publishing.",
    };
  }

  if (intent === "draft_reply") {
    const tone = String(formData.get("tone") || "friendly");
    const excerpt = String(formData.get("excerpt") || "").trim();

    const draft =
      tone === "short"
        ? "Thanks so much for sharing this with us 💕"
        : tone === "helpful"
          ? "Thanks for sharing your experience. We really appreciate the feedback and we’re glad you took the time to let us know."
          : "Aww thank you for sharing this with us 💕 We love hearing how you styled it and really appreciate the support.";

    return {
      ok: true,
      replyDraft: excerpt ? draft : draft,
      message: "Reply draft generated. Edit it before posting.",
    };
  }

  return { ok: false, message: "Unknown AI Studio action." };
};

export default function AIStudioPage() {
  const { demoCount, products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="AI Studio">
      <s-section heading="Demo content safety">
        <s-stack direction="block" gap="base">
          <s-badge tone="info">AI Preview</s-badge>
          <s-paragraph>
            AI-generated samples use source AI_DEMO, never receive a verified badge,
            never contribute to genuine ratings or analytics, and are never returned
            by the public storefront reviews API.
          </s-paragraph>
          <s-text>Current AI preview reviews: {String(demoCount)}</s-text>
          {actionData?.message && <s-text>{actionData.message}</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Generate AI preview reviews">
        {products.length === 0 ? (
          <s-text color="subdued">No Shopify products available.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => (
              <Form method="post" key={product.id}>
                <input type="hidden" name="intent" value="generate_demo" />
                <input type="hidden" name="productId" value={product.id} />
                <input
                  type="hidden"
                  name="productHandle"
                  value={product.handle}
                />
                <input
                  type="hidden"
                  name="productTitle"
                  value={product.title}
                />

                <s-box padding="base" border="base" borderRadius="base">
                  <s-grid gridTemplateColumns="1fr 180px auto" gap="base" alignItems="end">
                    <s-stack direction="block" gap="small">
                      <s-heading>{product.title}</s-heading>
                      <s-text color="subdued">{product.handle}</s-text>
                    </s-stack>

                    <s-select label="Preview count" name="count" value="6">
                      <s-option value="6">6 samples</s-option>
                      <s-option value="12">12 samples</s-option>
                      <s-option value="24">24 samples</s-option>
                    </s-select>

                    <s-button type="submit" variant="secondary">
                      Generate preview
                    </s-button>
                  </s-grid>
                </s-box>
              </Form>
            ))}

            <Form method="post">
              <input type="hidden" name="intent" value="clear_demo" />
              <s-button type="submit" variant="secondary" tone="critical">
                Clear all AI preview content
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Appearance suggestions">
        <s-paragraph>
          These constrained presets update VibeProof design tokens only. Nothing
          generates arbitrary CSS, and you can review the result in Display.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <Form method="post">
            <input type="hidden" name="intent" value="apply_preset" />
            <input type="hidden" name="preset" value="SPOILD_NATIVE" />
            <s-button type="submit" variant="secondary">Spoild Native</s-button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="apply_preset" />
            <input type="hidden" name="preset" value="SOFT_GIRL" />
            <s-button type="submit" variant="secondary">Soft Girl</s-button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="apply_preset" />
            <input type="hidden" name="preset" value="AFTER_DARK" />
            <s-button type="submit" variant="secondary">After Dark</s-button>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Design prompt">
        <s-paragraph>
          Describe a direction in plain language. VibeProof maps it to safe design
          tokens only; it never generates arbitrary CSS.
        </s-paragraph>

        <Form method="post">
          <input type="hidden" name="intent" value="design_prompt" />
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Design direction"
              name="designPrompt"
              placeholder="Soft pink, romantic, social and elevated"
            ></s-text-field>
            <s-button type="submit" variant="secondary">
              Suggest appearance
            </s-button>
          </s-grid>
        </Form>
      </s-section>

      <s-section heading="Merchant reply draft">
        <Form method="post">
          <input type="hidden" name="intent" value="draft_reply" />

          <s-stack direction="block" gap="base">
            <s-select label="Tone" name="tone" value="friendly">
              <s-option value="friendly">Friendly</s-option>
              <s-option value="short">Short</s-option>
              <s-option value="helpful">Helpful</s-option>
            </s-select>

            <s-text-area
              label="Review excerpt"
              name="excerpt"
              rows={4}
              placeholder="Paste the review text you want to respond to."
            ></s-text-area>

            <s-button type="submit" variant="primary">
              Draft reply
            </s-button>

            {actionData?.replyDraft && (
              <s-box padding="base" border="base" borderRadius="base">
                <s-text>{actionData.replyDraft}</s-text>
              </s-box>
            )}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
