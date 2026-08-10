-- CreateTable
CREATE TABLE "short_link" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "short_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_link_code_key" ON "short_link"("code");
