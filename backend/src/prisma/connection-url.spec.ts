import { prismaConnectionUrl } from '../../prisma/connection-url';

describe('Prisma CLI connection URL', () => {
  const transactionUrl =
    'postgresql://postgres.test:sample%40password@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&schema=public';

  it('uses the same Supabase database over the session pooler for migrations', () => {
    expect(prismaConnectionUrl({ DATABASE_URL: transactionUrl })).toBe(
      'postgresql://postgres.test:sample%40password@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require&schema=public',
    );
  });

  it('prefers an explicit DIRECT_URL without changing the runtime URL', () => {
    const env = {
      DATABASE_URL: transactionUrl,
      DIRECT_URL:
        'postgresql://postgres:sample@db.test.supabase.co:5432/postgres',
    };
    expect(prismaConnectionUrl(env)).toBe(env.DIRECT_URL);
    expect(env.DATABASE_URL).toBe(transactionUrl);
  });

  it('treats a blank override as absent', () => {
    expect(
      prismaConnectionUrl({ DATABASE_URL: transactionUrl, DIRECT_URL: ' ' }),
    ).toBe(prismaConnectionUrl({ DATABASE_URL: transactionUrl }));
  });

  it.each([
    'postgresql://postgres:sample@localhost:5432/railchart',
    'postgres://postgres:sample@localhost:6543/railchart?pgbouncer=true',
    'postgresql://postgres:sample@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
    'postgresql://postgres:sample@pooler.supabase.com.example.invalid:6543/postgres?pgbouncer=true',
  ])('preserves non-transaction-pooler URLs: %s', (url) => {
    expect(prismaConnectionUrl({ DATABASE_URL: url })).toBe(url);
  });

  it('rejects a misconfigured DIRECT_URL instead of silently using transaction pooling', () => {
    expect(() => prismaConnectionUrl({ DIRECT_URL: transactionUrl })).toThrow(
      'DIRECT_URL must use Supabase session pooling',
    );
  });

  it.each([
    'postgresql://user:private-password@[invalid',
    'https://user:private-password@example.invalid',
  ])('rejects invalid URLs without leaking credentials', (url) => {
    expect(() => prismaConnectionUrl({ DATABASE_URL: url })).toThrow(
      'Prisma requires',
    );
    expect(() => prismaConnectionUrl({ DATABASE_URL: url })).not.toThrow(
      'private-password',
    );
  });

  it('allows client generation with no configured database', () => {
    expect(prismaConnectionUrl({})).toBeUndefined();
  });
});
