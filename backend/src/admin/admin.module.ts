import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { IrctcModule } from '../irctc/irctc.module';

@Module({
  imports: [IrctcModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
