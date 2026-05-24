import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  async logAction(
    action: string,
    entityType: string,
    entityId: number,
    performedBy: number | null,
    actor: string,
  ): Promise<AuditLog> {
    // Append-only insert to preserve a tamper-evident audit history.
    const entry = this.auditLogsRepository.create({
      action,
      entityType,
      entityId,
      performedBy,
      actor,
    });

    return this.auditLogsRepository.save(entry);
  }

  async getLogs(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actor?: string;
  }): Promise<AuditLog[]> {
    // Build the WHERE clause dynamically to include only provided filters.
    const where: FindOptionsWhere<AuditLog> = {};

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.entityId !== undefined) {
      where.entityId = filters.entityId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.actor) {
      where.actor = filters.actor;
    }

    return this.auditLogsRepository.find({
      where,
      order: { timestamp: 'DESC' },
    });
  }
}
