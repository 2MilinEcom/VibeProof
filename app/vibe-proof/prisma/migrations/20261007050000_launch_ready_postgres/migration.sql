-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "variantId" TEXT,
    "variantTitle" TEXT,
    "customerEmail" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "variantId" TEXT,
    "variantTitle" TEXT,
    "orderId" TEXT,
    "reviewRequestId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerEmail" TEXT,
    "reviewerEmailHash" TEXT,
    "locale" TEXT,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "demoBatchId" TEXT,
    "spamScore" INTEGER NOT NULL DEFAULT 0,
    "spamReason" TEXT,
    "moderationNotes" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewMedia" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "altText" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "maxBytes" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantReply" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "merchantName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HelpfulVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpfulVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "collectRating" BOOLEAN NOT NULL DEFAULT true,
    "collectTitle" BOOLEAN NOT NULL DEFAULT true,
    "collectBody" BOOLEAN NOT NULL DEFAULT true,
    "collectEmail" BOOLEAN NOT NULL DEFAULT true,
    "collectPhoto" BOOLEAN NOT NULL DEFAULT true,
    "collectVideo" BOOLEAN NOT NULL DEFAULT true,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveFiveStar" BOOLEAN NOT NULL DEFAULT false,
    "maxMediaItems" INTEGER NOT NULL DEFAULT 4,
    "enablePostPurchaseRequests" BOOLEAN NOT NULL DEFAULT true,
    "requestDelayDays" INTEGER NOT NULL DEFAULT 7,
    "reminderDelayDays" INTEGER NOT NULL DEFAULT 5,
    "maxReminders" INTEGER NOT NULL DEFAULT 1,
    "autoVerifyOrders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WidgetTheme" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'SOCIAL_FEED',
    "heading" TEXT NOT NULL DEFAULT 'THE GIRLIES SAID IT BEST',
    "accentColor" TEXT NOT NULL DEFAULT '#111111',
    "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textColor" TEXT NOT NULL DEFAULT '#111111',
    "borderColor" TEXT NOT NULL DEFAULT '#E5E7EB',
    "radius" INTEGER NOT NULL DEFAULT 18,
    "mediaRatio" TEXT NOT NULL DEFAULT '4/5',
    "showVerified" BOOLEAN NOT NULL DEFAULT true,
    "showHelpful" BOOLEAN NOT NULL DEFAULT true,
    "showMerchantReplies" BOOLEAN NOT NULL DEFAULT true,
    "showFilters" BOOLEAN NOT NULL DEFAULT true,
    "showRatingBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "autoplayVideo" BOOLEAN NOT NULL DEFAULT false,
    "autoMatch" BOOLEAN NOT NULL DEFAULT true,
    "defaultSort" TEXT NOT NULL DEFAULT 'FEATURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetTheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "layoutOverride" TEXT,
    "headingOverride" TEXT,
    "accentColorOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductConfig_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'UNSUBSCRIBED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'CSV',
    "filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT,
    "productHandle" TEXT,
    "reviewId" TEXT,
    "anonymousId" TEXT,
    "sessionId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "requestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "summary" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "planHandle" TEXT,
    "emailRequestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mediaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 730,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_reviewRequestId_key" ON "Review"("reviewRequestId");
CREATE UNIQUE INDEX "ReviewRequest_tokenHash_key" ON "ReviewRequest"("tokenHash");
CREATE UNIQUE INDEX "MediaUpload_tokenHash_key" ON "MediaUpload"("tokenHash");
CREATE UNIQUE INDEX "MerchantReply_reviewId_key" ON "MerchantReply"("reviewId");
CREATE UNIQUE INDEX "HelpfulVote_reviewId_fingerprint_key" ON "HelpfulVote"("reviewId", "fingerprint");
CREATE UNIQUE INDEX "EmailSuppression_shop_emailHash_key" ON "EmailSuppression"("shop", "emailHash");
CREATE UNIQUE INDEX "CollectionSettings_shop_key" ON "CollectionSettings"("shop");
CREATE UNIQUE INDEX "WidgetTheme_shop_key" ON "WidgetTheme"("shop");
CREATE UNIQUE INDEX "ProductConfig_shop_productId_key" ON "ProductConfig"("shop", "productId");
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");
CREATE UNIQUE INDEX "ShopConfig_shop_key" ON "ShopConfig"("shop");

CREATE INDEX "Session_shop_idx" ON "Session"("shop");
CREATE INDEX "Review_shop_productId_idx" ON "Review"("shop", "productId");
CREATE INDEX "Review_shop_productHandle_idx" ON "Review"("shop", "productHandle");
CREATE INDEX "Review_shop_status_idx" ON "Review"("shop", "status");
CREATE INDEX "Review_shop_source_idx" ON "Review"("shop", "source");
CREATE INDEX "Review_shop_featured_idx" ON "Review"("shop", "featured");
CREATE INDEX "Review_shop_createdAt_idx" ON "Review"("shop", "createdAt");
CREATE INDEX "Review_shop_reviewerEmailHash_idx" ON "Review"("shop", "reviewerEmailHash");
CREATE INDEX "Review_shop_orderId_idx" ON "Review"("shop", "orderId");
CREATE INDEX "ReviewMedia_reviewId_position_idx" ON "ReviewMedia"("reviewId", "position");
CREATE INDEX "ReviewMedia_reviewId_status_idx" ON "ReviewMedia"("reviewId", "status");
CREATE INDEX "ReviewMedia_publicId_idx" ON "ReviewMedia"("publicId");
CREATE INDEX "MediaUpload_shop_expiresAt_idx" ON "MediaUpload"("shop", "expiresAt");
CREATE INDEX "HelpfulVote_createdAt_idx" ON "HelpfulVote"("createdAt");
CREATE INDEX "ProductConfig_shop_productHandle_idx" ON "ProductConfig"("shop", "productHandle");
CREATE INDEX "ProductConfig_shop_enabled_idx" ON "ProductConfig"("shop", "enabled");
CREATE INDEX "ReviewRequest_shop_status_sendAfter_idx" ON "ReviewRequest"("shop", "status", "sendAfter");
CREATE INDEX "ReviewRequest_shop_orderId_idx" ON "ReviewRequest"("shop", "orderId");
CREATE INDEX "ReviewRequest_shop_emailHash_idx" ON "ReviewRequest"("shop", "emailHash");
CREATE INDEX "EmailSuppression_shop_createdAt_idx" ON "EmailSuppression"("shop", "createdAt");
CREATE INDEX "ImportJob_shop_createdAt_idx" ON "ImportJob"("shop", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_type_createdAt_idx" ON "AnalyticsEvent"("shop", "type", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_productId_createdAt_idx" ON "AnalyticsEvent"("shop", "productId", "createdAt");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE INDEX "PrivacyRequest_shop_receivedAt_idx" ON "PrivacyRequest"("shop", "receivedAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "ReviewRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewMedia" ADD CONSTRAINT "ReviewMedia_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantReply" ADD CONSTRAINT "MerchantReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
