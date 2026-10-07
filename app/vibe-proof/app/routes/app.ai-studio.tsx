import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { aiProviderEnabled, generateAiText } from "../lib/ai.server";
import { GENUINE_REVIEW_SOURCES } from "../lib/constants.server";

const demoBodies = [
  "The fit feels really flattering and easy to style.",
  "The fabric looks cute in photos and the silhouette is exactly what I wanted.",
  "I love how this looks dressed up or kept casual.",
  "The cut is super fun and the overall look feels very social-ready.",
  "This would be such a good going-out piece.",
  "The shape is really cute and the details stand out in person.",
];

const demoNames = ["Mia R.", "Ava K.", "Nia S.", "Sofia T.", "Jade M.", "Layla C."];

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
      nodes?: Array<{ id: string; title: string; handle: string }>;
    };
  };
};

type DemoIdea = {
  name?: string;
  rating?: number;
  title?: string;
  body?: string;
};

function parseDemoIdeas(raw: string | null, count: number): DemoIdea[] {
  if (!raw) return [];
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, count).filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [demoCount, response, recentReviews] = await Promise.all([
    prisma.review.count({ where: { shop: session.shop, source: "AI_DEMO" } }),
    admin.graphql(
      `#graphql
        query VibeProofProducts {
          products(first: 25, sortKey: TITLE) {
            nodes { id title handle }
          }
        }`,
    ),
    prisma.review.findMany({
      where: {
        shop: session.shop,
        source: { in: [...GENUINE_REVIEW_SOURCES] },
        status: "APPROVED",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { rating: true, title: true, body: true, productTitle: true },
    }),
  ]);

  const responseJson = (await response.json()) as ProductsResponse;

  return {
    demoCount,
    providerEnabled: aiProviderEnabled(),
    products: responseJson.data?.products?.nodes ?? [],
    summaryEligibleCount: recentReviews.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate_demo") {
    const productId = String(formData.get("productId") || "");
    const productHandle = String(formData.get("productHandle") || "");
    const productTitle = String(formData.get("productTitle") || "");
    const requestedCount = Number(formData.get("count") || 6);
    const count = [6, 12, 24].includes(requestedCount) ? requestedCount : 6;
    const tone = String(formData.get("tone") || "social");

    if (!productId || !productHandle || !productTitle) {
      return { ok: false, message: "Choose a product." };
    }

    let ideas: DemoIdea[] = [];
    try {
      const generated = await generateAiText({
        task: "demo",
        productTitle,
        count,
        tone,
      });
      ideas = parseDemoIdeas(generated, count);
    } catch {
      ideas = [];
    }

    const batchId = randomUUID();
    const records = Array.from({ length: count }, (_, index) => {
      const idea = ideas[index];
      const rating = Math.max(1, Math.min(5, Math.round(Number(idea?.rating || 4 + (index % 2)))));
      return {
        shop: session.shop,
        productId,
        productHandle,
        productTitle,
        rating,
        title: String(idea?.title || (index % 2 === 0 ? "Cute fit" : "Love the look")).slice(0, 160),
        body: String(idea?.body || demoBodies[index % demoBodies.length]).slice(0, 5000),
        reviewerName: String(idea?.name || demoNames[index % demoNames.length]).slice(0, 120),
        verifiedPurchase: false,
        status: "DEMO",
        source: "AI_DEMO",
        helpfulCount: 0,
        featured: false,
        demoBatchId: batchId,
      };
    });

    await prisma.review.createMany({ data: records });

    return {
      ok: true,
      message: `Created ${count} isolated AI preview reviews.`,
    };
  }

  if (intent === "clear_demo") {
    const result = await prisma.review.deleteMany({
      where: { shop: session.shop, source: "AI_DEMO" },
    });
    return { ok: true, message: `Removed ${result.count} AI preview reviews.` };
  }

  if (intent === "apply_preset" || intent === "design_prompt") {
    let presetName = String(formData.get("preset") || "SPOILD_NATIVE");

    if (intent === "design_prompt") {
      const prompt = String(formData.get("designPrompt") || "").trim().toLowerCase();
      if (!prompt) return { ok: false, message: "Enter a design direction." };
      presetName =
        /pink|soft|girly|romantic/.test(prompt)
          ? "SOFT_GIRL"
          : /dark|black|night|moody/.test(prompt)
            ? "AFTER_DARK"
            : "SPOILD_NATIVE";
    }

    if (!(presetName in presetMap)) {
      return { ok: false, message: "Unknown appearance preset." };
    }

    const preset = presetMap[presetName as keyof typeof presetMap];
    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, ...preset },
      update: preset,
    });

    return {
      ok: true,
      message: "Appearance mapped to constrained VibeProof design tokens.",
    };
  }

  if (intent === "draft_reply") {
    const tone = String(formData.get("tone") || "friendly");
    const excerpt = String(formData.get("excerpt") || "").trim().slice(0, 5000);
    if (!excerpt) return { ok: false, message: "Paste a review excerpt." };

    let draft: string | null = null;
    try {
      draft = await generateAiText({ task: "reply", tone, review: excerpt });
    } catch {
      draft = null;
    }

    if (!draft) {
      draft =
        tone === "short"
          ? "Thanks so much for sharing this with us 💕"
          : tone === "helpful"
            ? "Thanks for sharing your experience. We really appreciate the feedback and the time you took to let us know."
            : "Aww thank you for sharing this with us 💕 We really appreciate the support.";
    }

    return {
      ok: true,
      replyDraft: draft.slice(0, 2000),
      message: "Reply draft ready. Edit it before publishing.",
    };
  }

  if (intent === "summarize") {
    const reviews = await prisma.review.findMany({
      where: {
        shop: session.shop,
        source: { in: [...GENUINE_REVIEW_SOURCES] },
        status: "APPROVED",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { rating: true, title: true, body: true, productTitle: true },
    });

    if (reviews.length === 0) {
      return { ok: false, message: "Publish genuine reviews before generating insights." };
    }

    const inputs = reviews.map(
      (review) =>
        `${review.rating}/5 · ${review.productTitle || "Product"} · ${review.title || ""}\n${review.body}`,
    );

    let summary: string | null = null;
    try {
      summary = await generateAiText({ task: "summary", reviews: inputs });
    } catch {
      summary = null;
    }

    if (!summary) {
      const average =
        reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
      summary = [
        `Analyzed ${reviews.length} published reviews.`,
        `Average rating: ${average.toFixed(1)}/5.`,
        "Connect an AI provider to generate qualitative recurring themes.",
      ].join("\n");
    }

    return { ok: true, insightSummary: summary, message: "Review insights ready." };
  }

  return { ok: false, message: "Unknown AI Studio action." };
};

export default function AIStudioPage() {
  const { demoCount, products, providerEnabled, summaryEligibleCount } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="AI Studio">
      <s-section heading="AI status">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={providerEnabled ? "success" : "warning"}>
            {providerEnabled ? "AI provider connected" : "AI provider optional"}
          </s-badge>
          <s-badge tone="info">AI Preview</s-badge>
          <s-text>{String(demoCount)} demo reviews</s-text>
        </s-stack>
        <s-paragraph>
          AI_DEMO content stays isolated from genuine ratings, storefront output,
          analytics, verified badges, and exports. AI outputs are drafts and
          constrained suggestions; merchants remain in control.
        </s-paragraph>
        {actionData?.message && (
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.message}
          </s-banner>
        )}
      </s-section>

      <s-section heading="Review insights">
        <s-stack direction="block" gap="base">
          <s-text>{String(summaryEligibleCount)} published reviews available for analysis.</s-text>
          <Form method="post">
            <input type="hidden" name="intent" value="summarize" />
            <s-button type="submit" variant="primary">Generate review insights</s-button>
          </Form>
          {actionData?.insightSummary && (
            <s-box padding="base" border="base" borderRadius="base">
              <s-text>{actionData.insightSummary}</s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Generate safe demo previews">
        {products.length === 0 ? (
          <s-text color="subdued">No Shopify products available.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => (
              <Form method="post" key={product.id}>
                <input type="hidden" name="intent" value="generate_demo" />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="productHandle" value={product.handle} />
                <input type="hidden" name="productTitle" value={product.title} />
                <s-box padding="base" border="base" borderRadius="base">
                  <s-grid gridTemplateColumns="1fr 160px 180px auto" gap="base" alignItems="end">
                    <s-stack direction="block" gap="small">
                      <s-heading>{product.title}</s-heading>
                      <s-text color="subdued">{product.handle}</s-text>
                    </s-stack>
                    <s-select label="Count" name="count" value="6">
                      <s-option value="6">6 samples</s-option>
                      <s-option value="12">12 samples</s-option>
                      <s-option value="24">24 samples</s-option>
                    </s-select>
                    <s-select label="Tone" name="tone" value="social">
                      <s-option value="social">Social</s-option>
                      <s-option value="minimal">Minimal</s-option>
                      <s-option value="playful">Playful</s-option>
                    </s-select>
                    <s-button type="submit" variant="secondary">Generate</s-button>
                  </s-grid>
                </s-box>
              </Form>
            ))}
            <Form method="post">
              <input type="hidden" name="intent" value="clear_demo" />
              <s-button type="submit" variant="secondary" tone="critical">
                Clear AI preview content
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Appearance suggestions">
        <s-stack direction="inline" gap="base">
          {Object.keys(presetMap).map((preset) => (
            <Form method="post" key={preset}>
              <input type="hidden" name="intent" value="apply_preset" />
              <input type="hidden" name="preset" value={preset} />
              <s-button type="submit" variant="secondary">
                {preset.replaceAll("_", " ")}
              </s-button>
            </Form>
          ))}
        </s-stack>
        <Form method="post">
          <input type="hidden" name="intent" value="design_prompt" />
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Design direction"
              name="designPrompt"
              placeholder="Soft pink, romantic, social and elevated"
            ></s-text-field>
            <s-button type="submit" variant="secondary">Suggest appearance</s-button>
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
              placeholder="Paste the customer review."
            ></s-text-area>
            <s-button type="submit" variant="primary">Draft reply</s-button>
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
