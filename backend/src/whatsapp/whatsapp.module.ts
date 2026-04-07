import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { OpenaiService } from './openai/openai.service';
import { BookingV2Module } from '../booking-v2/booking-v2.module';

@Module({
  imports: [BookingV2Module],
  controllers: [WhatsappController],
  providers: [WhatsappService, OpenaiService]
})
export class WhatsappModule {}
