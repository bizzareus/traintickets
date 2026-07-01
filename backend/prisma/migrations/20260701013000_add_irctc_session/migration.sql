-- CreateTable
CREATE TABLE "irctc_session" (
    "id" TEXT NOT NULL,
    "cookie" TEXT NOT NULL DEFAULT '',
    "source" TEXT,
    "cookie_updated_at" TIMESTAMP(3),
    "harvest_locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "irctc_session_pkey" PRIMARY KEY ("id")
);
