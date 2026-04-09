import './instrument';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const allowedOrigins = ['http://localhost:3010', 'http://127.0.0.1:3010'];
  if (frontendUrl) {
    allowedOrigins.push(frontendUrl);
    // Also allow www variant if it's a domain
    if (frontendUrl.startsWith('https://') && !frontendUrl.includes('www.')) {
      allowedOrigins.push(frontendUrl.replace('https://', 'https://www.'));
    } else if (frontendUrl.startsWith('https://www.')) {
      allowedOrigins.push(frontendUrl.replace('https://www.', 'https://'));
    }
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3009);
}
void bootstrap();
