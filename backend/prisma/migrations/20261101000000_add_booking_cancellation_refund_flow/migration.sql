-- AlterEnum
ALTER TYPE "CancellationRequestStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "split_ticket_booking" ADD COLUMN "cancellation_pdf" BYTEA,
ADD COLUMN "cancellation_pdf_content_type" TEXT DEFAULT 'application/pdf',
ADD COLUMN "cancellation_pdf_filename" TEXT,
ADD COLUMN "cancellation_pdf_s3_key" TEXT,
ADD COLUMN "cancellation_pdf_uploaded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "booking_cancellation_request" ADD COLUMN "refund_amount" INTEGER,
ADD COLUMN "refund_id" TEXT,
ADD COLUMN "cancellation_pdf" BYTEA,
ADD COLUMN "cancellation_pdf_content_type" TEXT DEFAULT 'application/pdf',
ADD COLUMN "cancellation_pdf_filename" TEXT,
ADD COLUMN "cancellation_pdf_s3_key" TEXT,
ADD COLUMN "cancellation_pdf_uploaded_at" TIMESTAMP(3);
