import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../conversation/ai.service';

class CreateDocumentDto {
  @IsString()
  title!: string;

  @IsString()
  @MinLength(10)
  content!: string;
}

class TestChatDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

@Controller('hotels/me/knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly ai: AiService,
  ) {}

  @Get()
  list(@Request() req: { user: { hotelId: string } }) {
    return this.knowledge.listDocuments(req.user.hotelId);
  }

  @Post()
  create(
    @Request() req: { user: { hotelId: string } },
    @Body() dto: CreateDocumentDto,
  ) {
    return this.knowledge.createDocument(req.user.hotelId, dto);
  }

  @Delete(':id')
  delete(
    @Request() req: { user: { hotelId: string } },
    @Param('id') id: string,
  ) {
    return this.knowledge.deleteDocument(req.user.hotelId, id);
  }

  @Post('test-chat')
  async testChat(
    @Request() req: { user: { hotelId: string } },
    @Body() dto: TestChatDto,
  ) {
    const reply = await this.knowledge.testChat(
      req.user.hotelId,
      dto.message,
      (msg, ctx) => this.ai.generateResponse(req.user.hotelId, msg, ctx),
    );
    return { reply };
  }
}
