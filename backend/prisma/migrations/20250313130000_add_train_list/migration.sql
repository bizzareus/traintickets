-- CreateTable
CREATE TABLE "TrainList" (
    "id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "TrainList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainList_train_number_key" ON "TrainList"("train_number");

-- CreateIndex
CREATE INDEX "TrainList_train_number_idx" ON "TrainList"("train_number");

-- CreateIndex
CREATE INDEX "TrainList_label_idx" ON "TrainList"("label");
