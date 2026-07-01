-- CreateTable
CREATE TABLE "route_caching" (
    "cache_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_caching_pkey" PRIMARY KEY ("cache_key")
);

-- CreateIndex
CREATE INDEX "route_caching_expires_at_idx" ON "route_caching"("expires_at");
