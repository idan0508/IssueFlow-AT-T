import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'Idan' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'secret' })
  @IsString()
  password: string;
}
