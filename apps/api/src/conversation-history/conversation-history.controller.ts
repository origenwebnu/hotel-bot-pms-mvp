import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ConversationHistoryService,
  type ConversationHistoryLabel,
} from './conversation-history.service';

@Controller('hotels/me/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationHistoryController {
  constructor(private readonly history: ConversationHistoryService) {}

  @Get()
  list(
    @Request() req: { user: { hotelId: string } },
    @Query('label') label?: ConversationHistoryLabel,
  ) {
    if (label && label !== 'completed' && label !== 'abandoned') {
      return this.history.listForHotel(req.user.hotelId);
    }
    return this.history.listForHotel(req.user.hotelId, label);
  }

  @Get(':sessionId')
  getThread(
    @Request() req: { user: { hotelId: string } },
    @Param('sessionId') sessionId: string,
  ) {
    return this.history.getThread(req.user.hotelId, sessionId);
  }
}
