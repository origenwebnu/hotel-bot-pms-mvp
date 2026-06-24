import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import {
  ReservationHoldProcessor,
  ReservationHoldService,
} from './reservation-hold.service';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.RESERVATION_HOLDS }),
    CoreIntegratorModule,
  ],
  providers: [ReservationHoldService, ReservationHoldProcessor],
})
export class ReservationsModule {}
