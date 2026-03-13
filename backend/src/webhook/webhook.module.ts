import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { AlertModule } from '../alert/alert.module';

@Module({
  imports: [AlertModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
