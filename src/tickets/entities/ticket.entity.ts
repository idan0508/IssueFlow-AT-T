import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/user.entity';
import { Attachment } from './attachment.entity';

export enum TicketStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum TicketType {
  BUG = 'BUG',
  FEATURE = 'FEATURE',
  TECHNICAL = 'TECHNICAL',
}

@Entity({ name: 'tickets' })
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.TODO })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.LOW,
  })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ default: false })
  isOverdue: boolean;

  // Every ticket belongs to a project; the FK is stored on the tickets table.
  @ManyToOne(() => Project, { nullable: false })
  project: Project;

  // Tickets can be unassigned, so the assignee relation is optional.
  @ManyToOne(() => User, { nullable: true })
  assignee: User | null;

  //  Attachments stored for each ticket.
  @OneToMany(() => Attachment, (attachment) => attachment.ticket)
  attachments: Attachment[];

  @ManyToMany(() => Ticket, (ticket) => ticket.blocking)
  @JoinTable()
  blockedBy: Ticket[];

  @ManyToMany(() => Ticket, (ticket) => ticket.blockedBy)
  blocking: Ticket[];

  // Optimistic locking increments version on each update.
  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Soft deletes mark a timestamp instead of removing the row.
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
