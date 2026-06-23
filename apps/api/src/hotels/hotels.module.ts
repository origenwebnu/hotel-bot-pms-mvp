import { Module } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { HotelsController } from './hotels.controller';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CoreIntegratorModule, AuthModule],
  controllers: [HotelsController],
  providers: [HotelsService],
})
export class HotelsModule {}
