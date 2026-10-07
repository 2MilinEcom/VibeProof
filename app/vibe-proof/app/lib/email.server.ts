type ReviewEmailInput = {
  to: string;
  shop: string;
  productTitle: string;
  reviewUrl: string;
  unsubscribeUrl: string;
  reminder?: boolean;
};

export function reviewEmailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.REVIEW_EMAIL_FROM);
}

export async function sendReviewRequestEmail(input: ReviewEmailInput) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REVIEW_EMAIL_FROM || "";

  if (!apiKey || !from) {
    throw new Error("Review email delivery is not configured.");
  }

  const subject = input.reminder
    ? `Quick reminder: review ${input.productTitle}`
    : `How did you like ${input.productTitle}?`;

  const heading = input.reminder
    ? "Still want to share your vibe?"
    : "Tell us what you think";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
          <h1 style="font-size:26px">${heading}</h1>
          <p>Your feedback on <strong>${escapeHtml(input.productTitle)}</strong> helps future shoppers feel confident.</p>
          <p><a href="${escapeAttribute(input.reviewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Write a review</a></p>
          <p style="font-size:12px;color:#666">This request was sent because this email was used for an order from ${escapeHtml(input.shop)}.</p>
          <p style="font-size:12px"><a href="${escapeAttribute(input.unsubscribeUrl)}">Stop receiving VibeProof review requests from this store</a></p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider error: ${response.status} ${detail.slice(0, 300)}`);
  }

  return response.json();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char] || char;
  });
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
