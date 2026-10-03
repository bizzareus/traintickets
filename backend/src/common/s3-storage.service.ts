import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_BUCKET = 'lastberth-ticket-storage';
const DEFAULT_REGION = 'ap-south-1';
const DEFAULT_URL_EXPIRATION_SECONDS = 3600; // 1 hour

function awsErrorLabel(err: unknown): string {
  const name = err instanceof Error && err.name ? err.name : 'UnknownError';
  const message = err instanceof Error ? err.message : String(err);
  return `${name}: ${message}`;
}

function sanitizeFilename(filename: string): string {
  const clean = filename.replace(/[^a-zA-Z0-9._-]/g, '_').trim();
  return clean.toLowerCase().endsWith('.pdf')
    ? clean
    : `${clean || 'ticket'}.pdf`;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucketName =
      this.config.get<string>('TICKET_PDF_S3_BUCKET')?.trim() || DEFAULT_BUCKET;
    this.region =
      this.config.get<string>('AWS_REGION')?.trim() || DEFAULT_REGION;

    this.s3Client = new S3Client({
      region: this.region,
    });

    this.logger.log(
      `[S3Storage] Initialized S3 storage service for bucket "${this.bucketName}" in region "${this.region}"`,
    );
  }

  get bucket(): string {
    return this.bucketName;
  }

  /**
   * Uploads a ticket PDF buffer to AWS S3.
   * Returns the S3 object key (e.g. "tickets/LB-ABC12/ticket.pdf").
   */
  async uploadTicketPdf(
    bookingRef: string,
    buffer: Buffer,
    filename: string,
    contentType = 'application/pdf',
  ): Promise<string> {
    const cleanFilename = sanitizeFilename(filename);
    const key = `tickets/${bookingRef}/${cleanFilename}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: `inline; filename="${cleanFilename}"`,
      });

      await this.s3Client.send(command);
      this.logger.log(
        `[S3Storage] Uploaded ticket PDF for ${bookingRef} to s3://${this.bucketName}/${key} (${buffer.length} bytes)`,
      );
      return key;
    } catch (err) {
      this.logger.error(
        `[S3Storage] Failed to upload ticket PDF for ${bookingRef}: ${awsErrorLabel(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to store ticket PDF in cloud storage',
      );
    }
  }

  /**
   * Generates a time-limited pre-signed URL for viewing or downloading a ticket PDF.
   */
  async getSignedTicketPdfUrl(
    s3Key: string,
    filename?: string,
    expiresInSeconds = DEFAULT_URL_EXPIRATION_SECONDS,
  ): Promise<string> {
    try {
      const cleanFilename = filename ? sanitizeFilename(filename) : undefined;
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: cleanFilename
          ? `inline; filename="${cleanFilename}"`
          : 'inline',
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      return signedUrl;
    } catch (err) {
      this.logger.error(
        `[S3Storage] Failed to generate signed URL for key "${s3Key}": ${awsErrorLabel(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to generate secure ticket download link',
      );
    }
  }

  /**
   * Deletes a ticket PDF from AWS S3.
   */
  async deleteTicketPdf(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      await this.s3Client.send(command);
      this.logger.log(`[S3Storage] Deleted ticket PDF at "${s3Key}"`);
    } catch (err) {
      this.logger.warn(
        `[S3Storage] Could not delete ticket PDF at "${s3Key}": ${awsErrorLabel(err)}`,
      );
    }
  }
}
