import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JourneyTaskService } from '../availability/journey-task.service';

async function main() {
  console.log('Initializing NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const journeyTaskService = app.get(JourneyTaskService);
    console.log('Running resendFailedWhatsAppNotifications...');
    const result = await journeyTaskService.resendFailedWhatsAppNotifications();
    console.log('Resend summary:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed to run resend script:', err);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Unhandled error in script:', err);
  process.exit(1);
});
