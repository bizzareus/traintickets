import { Module } from '@nestjs/common';
import { ConfirmTktProxyController } from './confirmtkt-proxy.controller';

@Module({
  controllers: [ConfirmTktProxyController],
})
export class ConfirmTktProxyModule {}
