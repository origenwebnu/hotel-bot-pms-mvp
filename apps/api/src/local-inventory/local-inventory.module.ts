import { Module } from '@nestjs/common';
import { LocalInventoryService } from './local-inventory.service';
import { InventoryController } from './inventory.controller';
import { DiscountTiersController } from './discount-tiers.controller';
import { DiscountTierService } from './discount-tier.service';

@Module({
  controllers: [InventoryController, DiscountTiersController],
  providers: [LocalInventoryService, DiscountTierService],
  exports: [LocalInventoryService, DiscountTierService],
})
export class LocalInventoryModule {}
