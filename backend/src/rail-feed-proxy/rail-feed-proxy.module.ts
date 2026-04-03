import { Module } from '@nestjs/common';
import { RailFeedProxyController } from './rail-feed-proxy.controller';

@Module({
  controllers: [RailFeedProxyController],
})
export class RailFeedProxyModule {}
