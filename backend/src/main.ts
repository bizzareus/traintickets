import './instrument';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const allowedOrigins = frontendUrl
    ? [frontendUrl, 'http://localhost:3010', 'http://127.0.0.1:3010']
    : ['http://localhost:3010', 'http://127.0.0.1:3010'];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3009);
}
void bootstrap();
