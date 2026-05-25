import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { Ticket, TicketPriority, TicketStatus } from './entities/ticket.entity';

@Injectable()
export class TicketsEscalationService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

  // Runs on a fixed cadence to promote overdue ticket priority until CRITICAL.
  @Cron(CronExpression.EVERY_HOUR)
  async escalateOverdueTickets(): Promise<void> {
    const now = new Date();

    // Find tickets that are past due, still active, and not yet escalated to CRITICAL.
    const overdueTickets = await this.ticketsRepository.find({
      where: {
        dueDate: LessThan(now),
        status: Not(TicketStatus.DONE),
        isOverdue: false,
        deletedAt: IsNull(),
      },
    });

    for (const ticket of overdueTickets) {
      // Promote priority once per run while keeping status unchanged.
      const nextPriority = this.promotePriority(ticket.priority);
      // Mark as overdue once priority is CRITICAL to keep processing idempotent.
      const shouldMarkOverdue = nextPriority === TicketPriority.CRITICAL;

      await this.ticketsRepository.update(ticket.id, {
        priority: nextPriority,
        isOverdue: shouldMarkOverdue,
      });
    }
  }

  private promotePriority(priority: TicketPriority): TicketPriority {
    switch (priority) {
      case TicketPriority.LOW:
        return TicketPriority.MEDIUM;
      case TicketPriority.MEDIUM:
        return TicketPriority.HIGH;
      case TicketPriority.HIGH:
        return TicketPriority.CRITICAL;
      case TicketPriority.CRITICAL:
      default:
        return TicketPriority.CRITICAL;
    }
  }
}
