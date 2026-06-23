import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import { KnowledgeService } from './knowledge.service';

@Processor(QUEUE_NAMES.KNOWLEDGE_INDEX)
export class KnowledgeProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeProcessor.name);

  constructor(private readonly knowledge: KnowledgeService) {
    super();
  }

  async process(job: Job<{ documentId: string; hotelId: string }>) {
    this.logger.debug(`Indexing document ${job.data.documentId}`);
    await this.knowledge.indexDocument(job.data.documentId, job.data.hotelId);
  }
}
