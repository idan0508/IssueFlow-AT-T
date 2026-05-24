import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { CommentsService } from './comments.service';

@ApiTags('Comments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@UseGuards(JwtAuthGuard)
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List comments for a ticket' })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: 1,
          ticketId: 1,
          authorId: 2,
          content: 'Hello @jdoe',
          mentionedUsers: [{ id: 1, username: 'jdoe', fullName: 'John Doe' }],
        },
      ],
    },
  })
  @ApiNotFoundResponse({ description: 'Ticket with ID {ticketId} not found' })
  findAll(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<Array<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }>> {
    return this.commentsService.findAll(ticketId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a comment to a ticket' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 1,
        ticketId: 1,
        authorId: 2,
        content: 'Hello @jdoe',
        mentionedUsers: [{ id: 1, username: 'jdoe', fullName: 'John Doe' }],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Ticket with ID {ticketId} not found' })
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() body: CreateCommentDto,
  ): Promise<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }> {
    return this.commentsService.create(ticketId, body);
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Update a comment' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 1,
        ticketId: 1,
        authorId: 2,
        content: 'Updated comment',
        mentionedUsers: [],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Ticket with ID {ticketId} not found' })
  @ApiConflictResponse({ description: 'Comment was updated by another user' })
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() body: UpdateCommentDto,
  ): Promise<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }> {
    return this.commentsService.update(ticketId, commentId, body);
  }

  @Delete(':commentId')
  @ApiOperation({ summary: 'Delete a comment' })
  @ApiOkResponse({ description: 'Comment deleted' })
  @ApiNotFoundResponse({ description: 'Ticket with ID {ticketId} not found' })
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ): Promise<void> {
    return this.commentsService.remove(ticketId, commentId);
  }
}
