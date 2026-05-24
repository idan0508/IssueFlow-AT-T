import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TicketsService } from '../tickets/tickets.service';
import { User } from '../users/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    private readonly ticketsService: TicketsService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    ticketId: number,
    input: CreateCommentDto,
    userId: number,
  ): Promise<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }> {
    await this.ticketsService.findOne(ticketId);

    const comment = this.commentsRepository.create({
      content: input.content,
      ticketId,
      authorId: input.authorId,
      ticket: { id: ticketId },
      author: { id: input.authorId },
    });

    const saved = await this.commentsRepository.save(comment);
    // Audit trail writes are append-only and happen after the comment is persisted.
    await this.auditLogsService.logAction(
      'CREATE',
      'COMMENT',
      saved.id,
      userId,
      'USER',
    );
    return this.attachMentions(saved);
  }

  async findAll(
    ticketId: number,
  ): Promise<Array<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }>> {
    await this.ticketsService.findOne(ticketId);

    const comments = await this.commentsRepository.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(comments.map((comment) => this.attachMentions(comment)));
  }

  async update(
    ticketId: number,
    commentId: number,
    input: UpdateCommentDto,
    userId: number,
  ): Promise<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }> {
    await this.ticketsService.findOne(ticketId);

    const existing = await this.commentsRepository.findOne({
      where: { id: commentId, ticketId },
    });

    if (!existing) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Optimistic locking: update only if the version still matches.
    const result = await this.commentsRepository
      .createQueryBuilder()
      .update(Comment)
      .set({
        content: input.content,
        version: () => '"version" + 1',
      })
      .where('id = :id AND ticket_id = :ticketId AND version = :version', {
        id: commentId,
        ticketId,
        version: input.version,
      })
      .execute();

    if (!result.affected) {
      const latest = await this.commentsRepository.findOne({
        where: { id: commentId, ticketId },
      });

      throw new ConflictException({
        message: 'Comment was updated by another user',
        latestComment: latest ? await this.attachMentions(latest) : null,
      });
    }

    const updated = await this.commentsRepository.findOne({
      where: { id: commentId, ticketId },
    });

    if (!updated) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Audit trail writes are append-only and happen after the update succeeds.
    await this.auditLogsService.logAction(
      'UPDATE',
      'COMMENT',
      updated.id,
      userId,
      'USER',
    );
    return this.attachMentions(updated);
  }

  async remove(
    ticketId: number,
    commentId: number,
    userId: number,
  ): Promise<void> {
    await this.ticketsService.findOne(ticketId);

    const result = await this.commentsRepository.softDelete({
      id: commentId,
      ticketId,
    });

    if (!result.affected) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Audit trail writes are append-only and happen after the delete succeeds.
    await this.auditLogsService.logAction(
      'DELETE',
      'COMMENT',
      commentId,
      userId,
      'USER',
    );
  }

  private async attachMentions(
    comment: Comment,
  ): Promise<Comment & { mentionedUsers: Array<{ id: number; username: string; fullName: string }> }> {
    // Regex finds @username patterns to resolve mention metadata.
    const usernames = this.extractMentionedUsernames(comment.content);

    if (usernames.length === 0) {
      return { ...comment, mentionedUsers: [] };
    }

    const users = await this.usersRepository.find({
      where: { username: In(usernames) },
      select: ['id', 'username', 'fullName'],
    });

    return {
      ...comment,
      mentionedUsers: users.map((user) => ({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
      })),
    };
  }

  private extractMentionedUsernames(content: string): string[] {
    const matches = content.matchAll(MENTION_REGEX);
    const usernames = Array.from(matches, (match) => match[1]);
    return Array.from(new Set(usernames));
  }
}
