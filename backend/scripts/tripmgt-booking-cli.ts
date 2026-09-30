/**
 * Inspect an existing booking, or trigger the same persisted AI flow in development.
 * npx tsx scripts/tripmgt-booking-cli.ts BOOKING_REF [--simulate-payment]
 * The backend must be running. API_URL defaults to http://localhost:3009.
 */
import 'dotenv/config';

async function main() {
  const [bookingRef, ...flags] = process.argv.slice(2);
  if (
    !bookingRef ||
    !/^[A-Za-z0-9_-]+$/.test(bookingRef) ||
    flags.some((flag) => flag !== '--simulate-payment')
  ) {
    throw new Error(
      'Usage: tripmgt-booking-cli.ts BOOKING_REF [--simulate-payment]',
    );
  }
  const simulate = flags.includes('--simulate-payment');
  if (simulate && process.env.NODE_ENV === 'production') {
    throw new Error('Payment simulation is only available in development');
  }
  const endpoint = simulate ? 'simulate-pay' : 'status';
  const baseUrl = process.env.API_URL || 'http://localhost:3009';
  const response = await fetch(
    new URL(
      `/api/split-booking/${endpoint}/${encodeURIComponent(bookingRef)}`,
      baseUrl,
    ),
    {
      method: simulate ? 'POST' : 'GET',
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(`Booking API returned HTTP ${response.status}`);
  const status: unknown = await response.json();
  console.log(JSON.stringify(status, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Booking CLI failed');
  process.exitCode = 1;
});
