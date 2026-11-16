import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WasenderHealthcheckService } from './wasender-healthcheck.service';

@Module({
  controllers: [WhatsappController],
  providers: [WasenderHealthcheckService],
  exports: [WasenderHealthcheckService],
})
export class WhatsappModule {}
