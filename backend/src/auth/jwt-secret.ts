import { ConfigService } from '@nestjs/config';

export function jwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (secret) return secret;
  if (config.get('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'local-development-only-secret-change-me';
}
