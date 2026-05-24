import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Project } from '../projects/entities/project.entity';
import { UserRole } from '../users/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import {
  buildTicketsCsv,
  parseTicketsCsv,
} from './helpers/ticket-csv.helper';

const STATUS_ORDER: TicketStatus[] = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.IN_REVIEW,
  TicketStatus.DONE,
];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ==========================================
  // Core Ticket Operations (CRUD)
  // ==========================================
  async create(
    input: CreateTicketDto,
    userId: number,
  ): Promise<Ticket & { isOverdue: boolean }> {
    let assignee = input.assigneeId ? { id: input.assigneeId } : null;

    if (!input.assigneeId) {
      assignee = await this.calculateOptimalAssignee(input.projectId);
    }

    const ticket = this.ticketsRepository.create({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      type: input.type,
      dueDate: input.dueDate,
      // Map FK values to relations without extra queries.
      project: { id: input.projectId },
      assignee,
    });

    const saved = await this.ticketsRepository.save(ticket);
    // Audit trail writes are append-only and happen after the ticket is persisted.
    await this.auditLogsService.logAction(
      'CREATE',
      'TICKET',
      saved.id,
      userId,
      'USER',
    );
    return this.withIsOverdue(saved);
  }

  async findAll(projectId: number): Promise<Array<Ticket & { isOverdue: boolean }>> {
    const tickets = await this.ticketsRepository.find({
      where: { project: { id: projectId } },
      relations: { project: true, assignee: true },
    });

    // isOverdue is derived at read time to avoid storing computed state.
    return tickets.map((ticket) => this.withIsOverdue(ticket));
  }

  async findDeleted(
    projectId: number,
  ): Promise<Array<Ticket & { isOverdue: boolean }>> {
    // Include soft-deleted rows and filter to only those with a deletion timestamp.
    const tickets = await this.ticketsRepository.find({
      where: { project: { id: projectId }, deletedAt: Not(IsNull()) },
      relations: { project: true, assignee: true },
      withDeleted: true,
    });

    return tickets.map((ticket) => this.withIsOverdue(ticket));
  }

  async findOne(id: number): Promise<Ticket & { isOverdue: boolean }> {
    const ticket = await this.ticketsRepository.findOne({
      where: { id },
      relations: { project: true, assignee: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    return this.withIsOverdue(ticket);
  }

  async update(
    id: number,
    input: UpdateTicketDto,
    userId: number,
  ): Promise<Ticket & { isOverdue: boolean }> {
    const ticket = await this.ticketsRepository.findOne({
      where: { id },
      relations: { project: true, assignee: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    // DONE tickets are immutable to preserve final state.
    if (ticket.status === TicketStatus.DONE) {
      throw new BadRequestException('Cannot update a ticket that is DONE');
    }

    // Optimistic locking: compare the client version with the DB version.
    if (input.version !== ticket.version) {
      throw new ConflictException({
        message: 'Ticket updated by another user',
        latestTicket: this.withIsOverdue(ticket),
      });
    }

    if (input.status) {
      const currentIndex = STATUS_ORDER.indexOf(ticket.status);
      const nextIndex = STATUS_ORDER.indexOf(input.status);

      // Status may only move forward through the lifecycle.
      if (nextIndex < currentIndex) {
        throw new BadRequestException('Ticket status cannot move backwards');
      }
    }

    const updatePayload = {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      type: input.type,
      dueDate: input.dueDate,
      project: input.projectId ? { id: input.projectId } : ticket.project,
      assignee:
        input.assigneeId !== undefined
          ? input.assigneeId
            ? { id: input.assigneeId }
            : null
          : ticket.assignee,
    };

    // Apply the update only if the version still matches to prevent lost updates.
    const result = await this.ticketsRepository
      .createQueryBuilder()
      .update(Ticket)
      .set({
        ...updatePayload,
        version: () => '"version" + 1',
      })
      .where('id = :id AND version = :version', { id, version: input.version })
      .execute();

    if (!result.affected) {
      const latest = await this.ticketsRepository.findOne({
        where: { id },
        relations: { project: true, assignee: true },
      });

      throw new ConflictException({
        message: 'Ticket updated by another user',
        latestTicket: latest ? this.withIsOverdue(latest) : null,
      });
    }

    const updated = await this.ticketsRepository.findOne({
      where: { id },
      relations: { project: true, assignee: true },
    });

    if (!updated) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    // Audit trail writes are append-only and happen after the update succeeds.
    await this.auditLogsService.logAction(
      'UPDATE',
      'TICKET',
      updated.id,
      userId,
      'USER',
    );
    return this.withIsOverdue(updated);
  }

  async remove(id: number, userId: number): Promise<void> {
    // Soft delete keeps the row for audit and restore flows.
    const result = await this.ticketsRepository.softDelete(id);

    if (!result.affected) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    // Audit trail writes are append-only and happen after the delete succeeds.
    await this.auditLogsService.logAction(
      'DELETE',
      'TICKET',
      id,
      userId,
      'USER',
    );
  }

  async restore(id: number, userId: number): Promise<Ticket & { isOverdue: boolean }> {
    // Restore clears the deleted_at column so the record is visible to normal queries again.
    const result = await this.ticketsRepository.restore(id);

    if (!result.affected) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    const restored = await this.ticketsRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { project: true, assignee: true },
    });

    if (!restored) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    // Audit trail writes are append-only and happen after the restore succeeds.
    await this.auditLogsService.logAction(
      'RESTORE',
      'TICKET',
      restored.id,
      userId,
      'USER',
    );
    return this.withIsOverdue(restored);
  }

  // ==========================================
  // Import/Export Operations
  // ==========================================
  async exportTicketsToCsv(projectId: number): Promise<string> {
    const tickets = await this.ticketsRepository.find({
      where: { project: { id: projectId } },
      relations: { project: true, assignee: true },
    });

    // isOverdue is derived at read time to avoid storing computed state.
    const enrichedTickets = tickets.map((ticket) => this.withIsOverdue(ticket));

    return buildTicketsCsv(enrichedTickets);
  }

  async importTicketsFromCsv(
    fileBuffer: Buffer,
    projectId: number,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    const projectExists = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectExists) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const { validRows, validationErrors } = parseTicketsCsv(
      fileBuffer,
      projectId,
    );
    const errors = [...validationErrors];
    const toCreate: Ticket[] = [];

    validRows.forEach((row) => {
      // Build entities in memory for a single bulk save.
      const ticket = this.ticketsRepository.create({
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        type: row.type,
        dueDate: row.dueDate,
        project: { id: row.projectId },
        assignee: row.assigneeId ? { id: row.assigneeId } : null,
      });

      toCreate.push(ticket);
    });

    const saved = toCreate.length
      ? await this.ticketsRepository.save(toCreate)
      : [];

    return {
      created: saved.length,
      failed: errors.length,
      errors,
    };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  // ==========================================
  // Feature 3.8 - Assignment/Workload Logic
  // ==========================================
  private async calculateOptimalAssignee(
    projectId: number,
  ): Promise<{ id: number } | null> {
    const tickets = await this.ticketsRepository.find({
      where: { project: { id: projectId }, deletedAt: IsNull() },
      relations: { assignee: true },
    });

    const workloadMap = new Map<
      number,
      { userId: number; username: string; openTicketCount: number }
    >();

    // Workload counts open tickets only, while gathering developers assigned within the project.
    for (const ticket of tickets) {
      if (!ticket.assignee || ticket.assignee.role !== UserRole.DEVELOPER) {
        continue;
      }

      if (!workloadMap.has(ticket.assignee.id)) {
        workloadMap.set(ticket.assignee.id, {
          userId: ticket.assignee.id,
          username: ticket.assignee.username,
          openTicketCount: 0,
        });
      }

      if (ticket.status !== TicketStatus.DONE) {
        const target = workloadMap.get(ticket.assignee.id);
        if (target) {
          target.openTicketCount += 1;
        }
      }
    }

    const workloads = Array.from(workloadMap.values());
    // Tie-breaker keeps selection deterministic when workloads are equal.
    workloads.sort(
      (a, b) => a.openTicketCount - b.openTicketCount || a.userId - b.userId,
    );

    if (workloads.length === 0) {
      return null;
    }

    // TODO: Record in Audit Log (actor=SYSTEM, action=AUTO_ASSIGN)
    return { id: workloads[0].userId };
  }

  // ==========================================
  // Overdue Helper
  // ==========================================
  private withIsOverdue(ticket: Ticket): Ticket & { isOverdue: boolean } {
    const dueTime = ticket.dueDate ? new Date(ticket.dueDate).getTime() : 0;
    const isOverdue =
      dueTime > 0 && dueTime < Date.now() && ticket.status !== TicketStatus.DONE;

    return { ...ticket, isOverdue };
  }
}
