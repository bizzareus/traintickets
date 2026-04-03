import { Module } from '@nestjs/common';
import { IrctcModule } from '../irctc/irctc.module';
import { BookingV2Controller } from './booking-v2.controller';
import { BookingV2Service } from './booking-v2.service';

@Module({
  imports: [IrctcModule],
  controllers: [BookingV2Controller],
  providers: [BookingV2Service],
  exports: [BookingV2Service],
})
export class BookingV2Module {}
