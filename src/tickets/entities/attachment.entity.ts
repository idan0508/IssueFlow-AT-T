import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity({ name: 'attachments' })
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  // Original file name supplied by the client.
  @Column({ name: 'filename', type: 'varchar' })
  filename: string;

  @Column({ name: 'content_type', type: 'varchar' })
  contentType: string;

  @Column({ type: 'bytea' })
  data: Buffer;

  // Each attachment belongs to a ticket and is removed if the ticket is deleted.
  @ManyToOne(() => Ticket, (ticket) => ticket.attachments, {
    onDelete: 'CASCADE',
  })
  ticket: Ticket;
}
