export const GENUINE_REVIEW_SOURCES = [
  "CUSTOMER",
  "IMPORT",
  "MERCHANT_IMPORT",
] as const;

export const PUBLIC_REVIEW_STATUS = "APPROVED";
export const REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SPAM",
] as const;

export const MEDIA_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export const MAX_REVIEW_BODY_LENGTH = 5000;
export const MAX_REVIEW_TITLE_LENGTH = 160;
export const MAX_REVIEWER_NAME_LENGTH = 120;
export const MAX_MEDIA_ITEMS = 6;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const PUBLIC_REVIEW_FILTER = {
  status: PUBLIC_REVIEW_STATUS,
  source: {
    in: [...GENUINE_REVIEW_SOURCES],
  },
} as const;
