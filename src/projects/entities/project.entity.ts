import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity({ name: 'projects' })
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  // Each project belongs to one owner, and TypeORM stores the ownerId FK for us.
  @ManyToOne(() => User, { nullable: false })
  owner: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Soft deletes mark the row with a timestamp instead of removing it.
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
