import { Module } from '@nestjs/common';
import { FslWebhooksController } from './fsl-webhooks.controller';
import { FslWebhooksService } from './fsl-webhooks.service';

@Module({
  controllers: [FslWebhooksController],
  providers: [FslWebhooksService],
})
export class FslWebhooksModule {}
