import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { CoreIntegratorModule } from './core-integrator/core-integrator.module';
import { ConversationModule } from './conversation/conversation.module';
import { CheckoutModule } from './checkout/checkout.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AuthModule } from './auth/auth.module';
import { HotelsModule } from './hotels/hotels.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LocalInventoryModule } from './local-inventory/local-inventory.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { HealthModule } from './health/health.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { SimulatorModule } from './simulator/simulator.module';
import { QUEUE_NAMES } from '@hotel-bot/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.WHATSAPP_INBOUND },
      { name: QUEUE_NAMES.WHATSAPP_OUTBOUND },
      { name: QUEUE_NAMES.PAYMENT_WEBHOOK },
      { name: QUEUE_NAMES.KNOWLEDGE_INDEX },
      { name: QUEUE_NAMES.RESERVATION_HOLDS },
    ),
    PrismaModule,
    CryptoModule,
    CoreIntegratorModule,
    ConversationModule,
    CheckoutModule,
    WhatsAppModule,
    AuthModule,
    HotelsModule,
    KnowledgeModule,
    LocalInventoryModule,
    ReservationsModule,
    SuperAdminModule,
    HealthModule,
    RestaurantModule,
    SimulatorModule,
  ],
})
export class AppModule {}
