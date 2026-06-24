import { Module } from '@nestjs/common';
import { LocalInventoryService } from './local-inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [LocalInventoryService],
  exports: [LocalInventoryService],
})
export class LocalInventoryModule {}
