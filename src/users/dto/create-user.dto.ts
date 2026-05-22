import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'Idan' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Idan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Idan dahan' })
  @IsString()
  fullName: string;

  @ApiProperty({ enum: UserRole, example: UserRole.DEVELOPER })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ example: 'secret' })
  @IsOptional()
  @IsString()
  password?: string;
}
