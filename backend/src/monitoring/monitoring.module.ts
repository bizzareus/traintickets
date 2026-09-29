import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CronitorService } from './cronitor.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CronitorService],
  exports: [CronitorService],
})
export class MonitoringModule {}
