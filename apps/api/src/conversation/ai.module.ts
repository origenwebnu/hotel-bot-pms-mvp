import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [forwardRef(() => KnowledgeModule)],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
