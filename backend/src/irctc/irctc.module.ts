import { Module } from '@nestjs/common';
import { IrctcController } from './irctc.controller';
import { IrctcService } from './irctc.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IrctcController],
  providers: [IrctcService],
  exports: [IrctcService],
})
export class IrctcModule {}
