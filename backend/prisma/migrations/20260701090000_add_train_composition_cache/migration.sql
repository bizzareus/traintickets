-- CreateTable
CREATE TABLE "train_composition_cache" (
    "train_number" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "train_composition_cache_pkey" PRIMARY KEY ("train_number")
);
