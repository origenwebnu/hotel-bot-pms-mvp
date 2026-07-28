import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES } from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';

@Injectable()
export class ReservationHoldService implements OnModuleInit {
  private readonly logger = new Logger(ReservationHoldService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.RESERVATION_HOLDS) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly pms: CoreIntegratorService,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      JOB_NAMES.RELEASE_EXPIRED_HOLDS,
      {},
      {
        repeat: { every: 120_000 },
        jobId: 'release-expired-holds',
        removeOnComplete: true,
      },
    );
    this.logger.log('Programado: liberación de holds expirados cada 2 min');
  }

  async releaseExpiredHolds() {
    const now = new Date();
    const expired = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['hold', 'payment_pending'] },
        holdExpiresAt: { lt: now },
      },
    });

    for (const reservation of expired) {
      if (reservation.pmsReservationId) {
        await this.pms
          .releaseHold(reservation.hotelId, reservation.pmsReservationId)
          .catch((err) =>
            this.logger.warn(`releaseHold ${reservation.id}: ${err}`),
          );
      }
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'expired' },
      });
      this.logger.log(`Hold expirado liberado: ${reservation.id}`);
    }

    return expired.length;
  }
}

@Processor(QUEUE_NAMES.RESERVATION_HOLDS)
export class ReservationHoldProcessor extends WorkerHost {
  constructor(private readonly holdService: ReservationHoldService) {
    super();
  }

  async process(job: { name: string }) {
    if (job.name === JOB_NAMES.RELEASE_EXPIRED_HOLDS) {
      await this.holdService.releaseExpiredHolds();
    }
  }
}
