type AiTask =
  | {
      task: "reply";
      tone: string;
      review: string;
    }
  | {
      task: "summary";
      reviews: string[];
    }
  | {
      task: "demo";
      productTitle: string;
      count: number;
      tone: string;
    };

export function aiProviderEnabled() {
  return Boolean(
    process.env.AI_API_URL &&
      process.env.AI_API_KEY &&
      process.env.AI_MODEL,
  );
}

export async function generateAiText(task: AiTask) {
  const apiUrl = process.env.AI_API_URL || "";
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "";

  if (!apiUrl || !apiKey || !model) return null;

  const system = [
    "You are VibeProof, a concise ecommerce review assistant.",
    "Never invent medical, safety, durability, shipping, manufacturing, or guaranteed-results claims.",
    "Never imply AI-generated demo reviews are real customer reviews.",
    "For merchant replies, be warm, specific, and do not claim facts not present in the review.",
  ].join(" ");

  const user =
    task.task === "reply"
      ? `Draft a ${task.tone} merchant reply to this review:\n${task.review}`
      : task.task === "summary"
        ? `Summarize recurring themes from these reviews in 5 short bullets:\n${task.reviews.join("\n---\n")}`
        : `Create ${task.count} clearly fictional demo-review ideas for the product "${task.productTitle}" in a ${task.tone} tone. Return JSON array objects with name, rating, title, body. Avoid concrete product claims that were not supplied.`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider error: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() || null;
}
