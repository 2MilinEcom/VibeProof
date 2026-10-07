import crypto from "node:crypto";

import prisma from "../db.server";

const secret =
  process.env.VIBEPROOF_HASH_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "vibeproof-development-secret";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashValue(value: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqualHash(value: string, expectedHash: string) {
  const actual = Buffer.from(hashValue(value), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function getRequestIp(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export function requestFingerprint(request: Request, scope = "") {
  const ip = getRequestIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const language = request.headers.get("accept-language") || "";
  return hashValue([scope, ip, userAgent, language].join("|"));
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const now = new Date();
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!existing || existing.resetAt <= now) {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000);
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  const updated = await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return {
    allowed: updated.count <= limit,
    remaining: Math.max(0, limit - updated.count),
    resetAt: updated.resetAt,
  };
}

export function scoreReviewSpam(input: {
  reviewerName: string;
  title?: string | null;
  body: string;
}) {
  const combined = [input.reviewerName, input.title || "", input.body]
    .join(" ")
    .trim();

  let score = 0;
  const reasons: string[] = [];

  const links = combined.match(/https?:\/\//gi)?.length ?? 0;
  if (links >= 2) {
    score += 45;
    reasons.push("multiple links");
  } else if (links === 1) {
    score += 15;
    reasons.push("contains link");
  }

  if (/(.)\1{8,}/i.test(combined)) {
    score += 25;
    reasons.push("repeated characters");
  }

  if (/\b(?:crypto|casino|viagra|loan|telegram|whatsapp)\b/i.test(combined)) {
    score += 35;
    reasons.push("high-risk spam terms");
  }

  const letters = combined.replace(/[^A-Za-z]/g, "");
  const uppercase = letters.replace(/[^A-Z]/g, "");
  if (letters.length > 30 && uppercase.length / letters.length > 0.7) {
    score += 15;
    reasons.push("excessive uppercase");
  }

  if (input.body.trim().length < 8) {
    score += 10;
    reasons.push("very short body");
  }

  return {
    score: Math.min(100, score),
    reason: reasons.join(", ") || null,
  };
}


const encryptionKey = crypto
  .createHash("sha256")
  .update(secret)
  .digest();

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error("Invalid encrypted secret.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
