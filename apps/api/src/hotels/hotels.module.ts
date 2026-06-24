import { Module } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { HotelsController } from './hotels.controller';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [CoreIntegratorModule, AuthModule, WhatsAppModule],
  controllers: [HotelsController],
  providers: [HotelsService],
})
export class HotelsModule {}
