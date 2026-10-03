import 'dotenv/config';
import './instrument';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required by the Razorpay webhook signature check.
  // bodyParser is set to false so we can configure a 50MB limit for ticket PDF uploads.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', 'loopback, linklocal, uniquelocal');
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true; // Direct non-browser requests / healthchecks
    return (
      /^https:\/\/([a-zA-Z0-9-]+\.)*lastberth\.com$/.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    );
  };

  // Required so the @Cookies() decorator on admin endpoints can read
  // the httpOnly `admin_session` cookie set by /api/chart-time-ingestion/verify.
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3009);
}
void bootstrap();
