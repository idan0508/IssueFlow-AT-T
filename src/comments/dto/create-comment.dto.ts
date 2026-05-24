import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsNotEmpty()
  authorId: number;

  @ApiProperty({ example: 'Hello @jdoe!' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
