import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TicketPriority, TicketStatus, TicketType } from '../entities/ticket.entity';

export class CreateTicketDto {
  @ApiProperty({ example: 'Fix login bug' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Users cannot log in with SSO' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: TicketStatus, example: TicketStatus.TODO })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority, example: TicketPriority.LOW })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiProperty({ enum: TicketType, example: TicketType.BUG })
  @IsEnum(TicketType)
  type: TicketType;

  @ApiProperty({ example: '2026-04-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  dueDate: Date;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  projectId: number;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  assigneeId?: number;
}
