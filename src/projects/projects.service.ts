import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Ticket, TicketStatus } from '../tickets/entities/ticket.entity';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(input: CreateProjectDto, userId: number): Promise<Project> {
    const project = this.projectsRepository.create({
      name: input.name,
      description: input.description,
      // Map ownerId to the relation without an extra user lookup.
      owner: { id: input.ownerId },
    });

    const saved = await this.projectsRepository.save(project);
    // Audit trail writes are append-only and happen after the project is persisted.
    await this.auditLogsService.logAction(
      'CREATE',
      'PROJECT',
      saved.id,
      userId,
      'USER',
    );
    return saved;
  }

  findAll(): Promise<Project[]> {
    return this.projectsRepository.find({ relations: { owner: true } });
  }

  async findDeleted(): Promise<Project[]> {
    // Include soft-deleted rows and filter to only those with a deletion timestamp.
    return this.projectsRepository.find({
      where: { deletedAt: Not(IsNull()) },
      relations: { owner: true },
      withDeleted: true,
    });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { owner: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async getWorkload(
    projectId: number,
  ): Promise<Array<{ userId: number; username: string; openTicketCount: number }>> {
    const projectExists = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectExists) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const tickets = await this.ticketsRepository.find({
      where: { project: { id: projectId } },
      relations: { assignee: true },
    });

    const workloadMap = new Map<
      number,
      { userId: number; username: string; openTicketCount: number }
    >();

    // Workload counts only non-DONE tickets, while still listing users assigned to DONE tickets.
    for (const ticket of tickets) {
      if (!ticket.assignee) {
        continue;
      }

      const existing = workloadMap.get(ticket.assignee.id);
      if (!existing) {
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
    // Tie-breaker keeps ordering deterministic when workloads are equal.
    workloads.sort(
      (a, b) => a.openTicketCount - b.openTicketCount || a.userId - b.userId,
    );

    return workloads;
  }

  async update(
    id: number,
    input: UpdateProjectDto,
    userId: number,
  ): Promise<Project> {
    const project = await this.projectsRepository.preload({
      id,
      ...input,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    const saved = await this.projectsRepository.save(project);
    // Audit trail writes are append-only and happen after the update succeeds.
    await this.auditLogsService.logAction(
      'UPDATE',
      'PROJECT',
      saved.id,
      userId,
      'USER',
    );
    return saved;
  }

  async remove(id: number, userId: number): Promise<void> {
    // Soft delete keeps the record for restore flows and audit needs.
    const result = await this.projectsRepository.softDelete(id);

    if (!result.affected) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Audit trail writes are append-only and happen after the delete succeeds.
    await this.auditLogsService.logAction(
      'DELETE',
      'PROJECT',
      id,
      userId,
      'USER',
    );
  }

  async restore(id: number): Promise<Project> {
    // Restore clears the deleted_at column so the record is visible to normal queries again.
    const result = await this.projectsRepository.restore(id);

    if (!result.affected) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    const restored = await this.projectsRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { owner: true },
    });

    if (!restored) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return restored;
  }
}
