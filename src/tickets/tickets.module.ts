import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/user.entity';
import { Attachment } from './entities/attachment.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketsEscalationService } from './tickets-escalation.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Project, Attachment, User]),
    AuditLogsModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsEscalationService],
  exports: [TicketsService],
})
export class TicketsModule {}
