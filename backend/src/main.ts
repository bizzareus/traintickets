import 'dotenv/config';
import './instrument';

import { NestFactory } from '@nestjs/core';
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
