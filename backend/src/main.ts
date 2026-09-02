import 'dotenv/config';
import './instrument';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
