import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Idan dahan' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.ADMIN })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
