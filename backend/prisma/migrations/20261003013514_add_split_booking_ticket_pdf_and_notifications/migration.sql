-- AlterTable
ALTER TABLE "split_ticket_booking" ADD COLUMN     "customer_email_sent_at" TIMESTAMP(3),
ADD COLUMN     "customer_whatsapp_sent_at" TIMESTAMP(3),
ADD COLUMN     "ticket_pdf" BYTEA,
ADD COLUMN     "ticket_pdf_content_type" TEXT DEFAULT 'application/pdf',
ADD COLUMN     "ticket_pdf_filename" TEXT,
ADD COLUMN     "ticket_pdf_uploaded_at" TIMESTAMP(3);
