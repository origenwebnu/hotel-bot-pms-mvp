import { Module } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { SimulatorController } from './simulator.controller';
import { AiModule } from '../conversation/ai.module';
import { RestaurantModule } from '../restaurant/restaurant.module';

@Module({
  imports: [AiModule, RestaurantModule],
  controllers: [SimulatorController],
  providers: [SimulatorService],
})
export class SimulatorModule {}
