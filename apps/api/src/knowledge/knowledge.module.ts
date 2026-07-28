import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeProcessor } from './knowledge.processor';
import { EmbeddingsService } from './embeddings.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../conversation/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.KNOWLEDGE_INDEX }),
    AuthModule,
    forwardRef(() => AiModule),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessor, EmbeddingsService],
  exports: [KnowledgeService, EmbeddingsService],
})
export class KnowledgeModule {}
