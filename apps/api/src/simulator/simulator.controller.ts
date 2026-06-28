import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SimulatorService, type SimulatorSession } from './simulator.service';

class SimulatorChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsObject()
  session?: SimulatorSession;
}

@Controller('hotels/me/simulator')
@UseGuards(JwtAuthGuard)
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get('bootstrap')
  bootstrap(@Req() req: { user: { hotelId: string } }) {
    return this.simulator.bootstrap(req.user.hotelId);
  }

  @Post('chat')
  chat(@Req() req: { user: { hotelId: string } }, @Body() body: SimulatorChatDto) {
    return this.simulator.chat(req.user.hotelId, body.message, body.session ?? { state: 'idle' });
  }
}
