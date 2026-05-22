import { Exclude } from 'class-transformer';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

@Entity({ name: 'users' })
export class User {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Idan' })
  @Column({ unique: true })
  username: string;

  @ApiProperty({ example: 'Idan@example.com' })
  @Column()
  email: string;

  @ApiProperty({ example: 'Idan dahan' })
  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ default: '' })
  @Exclude()
  @ApiHideProperty()
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.DEVELOPER })
  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;
}
