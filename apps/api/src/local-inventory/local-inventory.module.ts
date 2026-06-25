import { Module } from '@nestjs/common';
import { LocalInventoryService } from './local-inventory.service';
import { InventoryController } from './inventory.controller';
import { PublicRoomController } from './public-room.controller';
import { DiscountTiersController } from './discount-tiers.controller';
import { DiscountTierService } from './discount-tier.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [InventoryController, PublicRoomController, DiscountTiersController],
  providers: [LocalInventoryService, DiscountTierService],
  exports: [LocalInventoryService, DiscountTierService],
})
export class LocalInventoryModule {}
