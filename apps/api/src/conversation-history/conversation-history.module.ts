import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationHistoryController } from './conversation-history.controller';
import { ConversationHistoryService } from './conversation-history.service';

@Module({
  imports: [AuthModule],
  controllers: [ConversationHistoryController],
  providers: [ConversationHistoryService],
  exports: [ConversationHistoryService],
})
export class ConversationHistoryModule {}
