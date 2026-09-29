/** Prisma CLI needs a direct/session connection, not Supabase transaction pooling. */
export function prismaConnectionUrl(
  env: Pick<NodeJS.ProcessEnv, 'DIRECT_URL' | 'DATABASE_URL'>,
): string | undefined {
  const direct = env.DIRECT_URL?.trim();
  const connection = direct || env.DATABASE_URL;
  if (!connection) return undefined; // prisma generate does not need a live database.
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error(
      'Prisma requires a valid PostgreSQL DIRECT_URL or DATABASE_URL',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Prisma requires a PostgreSQL connection URL');
  }
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    if (direct)
      throw new Error(
        'DIRECT_URL must use Supabase session pooling (5432) or a direct database connection',
      );
    // Same host, credentials, and database; only the documented pooler mode changes.
    url.port = '5432';
    url.searchParams.delete('pgbouncer');
  }
  return url.toString();
}
