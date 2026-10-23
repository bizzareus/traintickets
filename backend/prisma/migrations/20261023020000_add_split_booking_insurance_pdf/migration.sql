-- AlterTable
ALTER TABLE "split_ticket_booking" ADD COLUMN "insurance_pdf" BYTEA,
ADD COLUMN "insurance_pdf_content_type" TEXT DEFAULT 'application/pdf',
ADD COLUMN "insurance_pdf_filename" TEXT,
ADD COLUMN "insurance_pdf_s3_key" TEXT,
ADD COLUMN "insurance_pdf_uploaded_at" TIMESTAMP(3);
