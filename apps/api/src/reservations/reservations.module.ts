import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import {
  ReservationHoldProcessor,
  ReservationHoldService,
} from './reservation-hold.service';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.RESERVATION_HOLDS }),
    CoreIntegratorModule,
    AuthModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationHoldService, ReservationHoldProcessor, ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
