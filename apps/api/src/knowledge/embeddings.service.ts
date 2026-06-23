import { Injectable } from '@nestjs/common';
import { getOpenAiClient } from '../common/openai.client';

@Injectable()
export class EmbeddingsService {
  async generateEmbedding(text: string): Promise<number[]> {
    const openai = getOpenAiClient();
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }
}
