import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { OpenaiService } from './openai/openai.service';
import { WasenderHealthcheckService } from './wasender-healthcheck.service';
import { BookingV2Module } from '../booking-v2/booking-v2.module';

@Module({
  imports: [BookingV2Module],
  controllers: [WhatsappController],
  providers: [WhatsappService, OpenaiService, WasenderHealthcheckService],
  exports: [WhatsappService, WasenderHealthcheckService],
})
export class WhatsappModule {}
