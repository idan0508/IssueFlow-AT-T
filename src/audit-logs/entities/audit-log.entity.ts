import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: number;

  @Column({ name: 'performed_by', type: 'int', nullable: true })
  performedBy: number | null;

  @Column()
  actor: string;

  // Immutable timestamp captured at insert time for append-only audit history.
  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
