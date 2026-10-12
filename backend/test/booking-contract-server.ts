import { createBookingTestApp } from './booking-test-app';
import type { Request, Response } from 'express';

async function main() {
  const app = await createBookingTestApp();
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .get('/health', (_request: Request, response: Response) => {
      response.status(200).send('booking-contract');
    });
  await app.listen(
    Number(process.env.BOOKING_CONTRACT_PORT ?? 3109),
    '127.0.0.1',
  );
}

void main();
