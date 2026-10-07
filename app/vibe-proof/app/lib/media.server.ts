import crypto from "node:crypto";

import prisma from "../db.server";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./constants.server";
import { hashValue, randomToken } from "./security.server";

const allowedImages = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const allowedVideos = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

  return {
    enabled: Boolean(cloudName && apiKey && apiSecret),
    cloudName,
    apiKey,
    apiSecret,
  };
}

export function mediaUploadEnabled() {
  return cloudinaryConfig().enabled;
}

export async function createMediaUploadSignature(input: {
  shop: string;
  mimeType: string;
  bytes: number;
}) {
  const config = cloudinaryConfig();
  if (!config.enabled) {
    throw new Error("Media uploads are not configured.");
  }

  const resourceType = allowedVideos.has(input.mimeType)
    ? "video"
    : allowedImages.has(input.mimeType)
      ? "image"
      : null;

  if (!resourceType) {
    throw new Error("Unsupported media type.");
  }

  const maxBytes =
    resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > maxBytes) {
    throw new Error(
      resourceType === "video"
        ? "Video must be 50 MB or smaller."
        : "Image must be 10 MB or smaller.",
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const shopKey = hashValue(input.shop).slice(0, 16);
  const publicId = `vibeproof/${shopKey}/${crypto.randomUUID()}`;
  const uploadToken = randomToken(32);
  const tokenHash = hashValue(uploadToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(signatureBase + config.apiSecret)
    .digest("hex");

  await prisma.mediaUpload.create({
    data: {
      shop: input.shop,
      tokenHash,
      publicId,
      mimeType: input.mimeType,
      resourceType,
      maxBytes,
      expiresAt,
    },
  });

  return {
    uploadToken,
    publicId,
    resourceType,
    maxBytes,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
  };
}

export async function consumeMediaUpload(input: {
  shop: string;
  uploadToken: string;
  publicId: string;
  secureUrl: string;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}) {
  const config = cloudinaryConfig();
  if (!config.enabled) throw new Error("Media uploads are not configured.");

  const upload = await prisma.mediaUpload.findUnique({
    where: { tokenHash: hashValue(input.uploadToken) },
  });

  if (
    !upload ||
    upload.shop !== input.shop ||
    upload.completed ||
    upload.expiresAt <= new Date() ||
    upload.publicId !== input.publicId
  ) {
    throw new Error("Invalid or expired media upload.");
  }

  const url = new URL(input.secureUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    !url.pathname.includes(`/${config.cloudName}/`)
  ) {
    throw new Error("Unexpected media URL.");
  }

  if (input.bytes && input.bytes > upload.maxBytes) {
    throw new Error("Uploaded media exceeds the allowed size.");
  }

  await prisma.mediaUpload.update({
    where: { id: upload.id },
    data: { completed: true },
  });

  return {
    type: upload.resourceType === "video" ? "VIDEO" : "IMAGE",
    url: input.secureUrl,
    publicId: input.publicId,
    bytes: input.bytes ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    durationMs: input.durationMs ?? null,
  };
}
