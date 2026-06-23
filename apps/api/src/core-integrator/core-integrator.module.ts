import { Module } from '@nestjs/common';
import { CoreIntegratorService } from './core-integrator.service';
import { CoreIntegratorController } from './core-integrator.controller';

@Module({
  controllers: [CoreIntegratorController],
  providers: [CoreIntegratorService],
  exports: [CoreIntegratorService],
})
export class CoreIntegratorModule {}
