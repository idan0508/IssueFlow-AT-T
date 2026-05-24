import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
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
  ) {}

  async create(input: CreateTicketDto): Promise<Ticket & { isOverdue: boolean }> {
    const ticket = this.ticketsRepository.create({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      type: input.type,
      dueDate: input.dueDate,
      // Map FK values to relations without extra queries.
      project: { id: input.projectId },
      assignee: input.assigneeId ? { id: input.assigneeId } : null,
    });

    const saved = await this.ticketsRepository.save(ticket);
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

  async update(id: number, input: UpdateTicketDto): Promise<Ticket & { isOverdue: boolean }> {
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

    return this.withIsOverdue(updated);
  }

  async remove(id: number): Promise<void> {
    // Soft delete keeps the row for audit and restore flows.
    const result = await this.ticketsRepository.softDelete(id);

    if (!result.affected) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
  }

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

  private withIsOverdue(ticket: Ticket): Ticket & { isOverdue: boolean } {
    const dueTime = ticket.dueDate ? new Date(ticket.dueDate).getTime() : 0;
    const isOverdue =
      dueTime > 0 && dueTime < Date.now() && ticket.status !== TicketStatus.DONE;

    return { ...ticket, isOverdue };
  }
}
