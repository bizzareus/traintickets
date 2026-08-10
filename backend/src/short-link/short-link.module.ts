import { Module } from '@nestjs/common';
import { ShortLinkService } from './short-link.service';
import { ShortLinkController } from './short-link.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ShortLinkService],
  controllers: [ShortLinkController],
  exports: [ShortLinkService],
})
export class ShortLinkModule {}
