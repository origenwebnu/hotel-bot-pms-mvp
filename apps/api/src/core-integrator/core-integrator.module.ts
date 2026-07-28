import { Module } from '@nestjs/common';
import { CoreIntegratorService } from './core-integrator.service';
import { CoreIntegratorController } from './core-integrator.controller';
import { LocalInventoryModule } from '../local-inventory/local-inventory.module';

@Module({
  imports: [LocalInventoryModule],
  controllers: [CoreIntegratorController],
  providers: [CoreIntegratorService],
  exports: [CoreIntegratorService],
})
export class CoreIntegratorModule {}
