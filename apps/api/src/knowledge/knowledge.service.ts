import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES } from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
/** Similitud mínima (coseno) para considerar que un documento aportó al RAG */
const RAG_MIN_SIMILARITY = 0.68;
const RAG_CANDIDATE_LIMIT = 20;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    @InjectQueue(QUEUE_NAMES.KNOWLEDGE_INDEX) private readonly indexQueue: Queue,
  ) {}

  async createDocument(
    hotelId: string,
    data: { title: string; content: string; source_type?: string; file_name?: string },
  ) {
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        hotelId,
        title: data.title,
        content: data.content,
        sourceType: data.source_type ?? 'text',
        fileName: data.file_name,
      },
    });

    await this.indexQueue.add(
      JOB_NAMES.INDEX_DOCUMENT,
      { documentId: doc.id, hotelId },
      { removeOnComplete: true },
    );

    return doc;
  }

  async listDocuments(hotelId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { hotelId },
      orderBy: [{ aiUsageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateDocument(
    hotelId: string,
    documentId: string,
    data: { title: string; content: string },
  ) {
    const doc = await this.prisma.knowledgeDocument.update({
      where: { id: documentId, hotelId },
      data: {
        title: data.title,
        content: data.content,
        isIndexed: false,
      },
    });

    await this.indexQueue.add(
      JOB_NAMES.INDEX_DOCUMENT,
      { documentId: doc.id, hotelId },
      { removeOnComplete: true },
    );

    return doc;
  }

  async deleteDocument(hotelId: string, documentId: string) {
    await this.prisma.knowledgeVector.deleteMany({
      where: { documentId, hotelId },
    });
    return this.prisma.knowledgeDocument.delete({
      where: { id: documentId, hotelId },
    });
  }

  async indexDocument(documentId: string, hotelId: string) {
    const doc = await this.prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: documentId },
    });

    await this.prisma.knowledgeVector.deleteMany({
      where: { documentId },
    });

    const chunks = this.chunkText(doc.content);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.embeddings.generateEmbedding(chunks[i]);
      const vectorStr = `[${embedding.join(',')}]`;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO knowledge_vectors (id, hotel_id, document_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, NOW())`,
        `kv_${documentId}_${i}`,
        hotelId,
        documentId,
        i,
        chunks[i],
        vectorStr,
      );
    }

    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { isIndexed: true },
    });

    this.logger.log(`Indexed ${chunks.length} chunks for document ${documentId}`);
  }

  async searchSimilar(hotelId: string, query: string, limit = 5): Promise<string> {
    const embedding = await this.embeddings.generateEmbedding(query);
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRawUnsafe<
      Array<{ content: string; document_id: string; similarity: number }>
    >(
      `SELECT content, document_id, 1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_vectors
       WHERE hotel_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      hotelId,
      RAG_CANDIDATE_LIMIT,
    );

    const ranked = results.map((r) => ({
      ...r,
      similarity: Number(r.similarity),
    }));

    const relevant = ranked.filter((r) => r.similarity >= RAG_MIN_SIMILARITY);
    const selected = (relevant.length > 0 ? relevant : ranked.slice(0, 1)).slice(0, limit);

    const documentIds = [...new Set(selected.map((r) => r.document_id))];
    if (documentIds.length > 0) {
      await this.prisma.knowledgeDocument.updateMany({
        where: { id: { in: documentIds }, hotelId },
        data: { aiUsageCount: { increment: 1 } },
      });
    }

    return selected.map((r) => r.content).join('\n---\n');
  }

  async testChat(hotelId: string, message: string, generateResponse: (msg: string, ctx: string) => Promise<string>): Promise<string> {
    const context = await this.searchSimilar(hotelId, message, 5);
    return generateResponse(message, `Modo prueba. Contexto RAG:\n${context}`);
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push(text.slice(start, end));
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks.length ? chunks : [text];
  }
}
