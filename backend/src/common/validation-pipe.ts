import { ValidationPipe } from '@nestjs/common';

/** Shared by the HTTP application and its contract tests. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}
