import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { User } from '../../users/user.entity';

@Entity({ name: 'comments' })
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  content: string;

  @Column({ name: 'ticket_id' })
  ticketId: number;

  @Column({ name: 'author_id' })
  authorId: number;

  // Each comment belongs to one ticket, TypeORM stores the FK on this table.
  @ManyToOne(() => Ticket, { nullable: false })
  ticket: Ticket;

  // Each comment is written by a single user, the FK is stored locally.
  @ManyToOne(() => User, { nullable: false })
  author: User;

  // Version is used for optimistic locking during updates.
  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
