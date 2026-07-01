import { Module } from '@nestjs/common';
import { RestaurantInventoryService } from './restaurant-inventory.service';
import { RestaurantController } from './restaurant.controller';
import { RestaurantBookingFlowService } from './restaurant-booking-flow.service';
import { RestaurantReservationService } from './restaurant-reservation.service';
import { AiModule } from '../conversation/ai.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AiModule, CheckoutModule, WhatsAppModule, SubscriptionModule, EmailModule],
  controllers: [RestaurantController],
  providers: [RestaurantInventoryService, RestaurantBookingFlowService, RestaurantReservationService],
  exports: [RestaurantInventoryService, RestaurantBookingFlowService, RestaurantReservationService],
})
export class RestaurantModule {}
