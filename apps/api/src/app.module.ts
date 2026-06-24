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
import { SuperAdminModule } from './super-admin/super-admin.module';
import { HealthModule } from './health/health.module';
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
    SuperAdminModule,
    HealthModule,
  ],
})
export class AppModule {}
