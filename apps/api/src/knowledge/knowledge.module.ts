import { Module, forwardRef } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeProcessor } from './knowledge.processor';
import { EmbeddingsService } from './embeddings.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../conversation/ai.module';

@Module({
  imports: [AuthModule, forwardRef(() => AiModule)],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessor, EmbeddingsService],
  exports: [KnowledgeService, EmbeddingsService],
})
export class KnowledgeModule {}
