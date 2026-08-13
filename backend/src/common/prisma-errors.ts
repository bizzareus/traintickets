/**
 * Helper to determine if a thrown error represents a Prisma P2002 unique constraint violation.
 */
export function isPrismaUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.code === 'P2002') return true;
  if (
    e.cause &&
    typeof e.cause === 'object' &&
    'kind' in e.cause &&
    e.cause.kind === 'UniqueConstraint'
  ) {
    return true;
  }
  return false;
}
