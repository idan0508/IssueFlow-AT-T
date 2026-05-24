import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: User, isArray: true })
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':userId')
  @ApiParam({ name: 'userId', type: Number })
  @ApiOkResponse({ type: User })
  findById(@Param('userId', ParseIntPipe) userId: number): Promise<User> {
    return this.usersService.findById(userId);
  }

  @Get(':userId/mentions')
  @ApiParam({ name: 'userId', type: Number })
  async getMentions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const pageSizeNumber = pageSize ? parseInt(pageSize, 10) : 10;
    
    return this.usersService.getMentions(userId, pageNumber, pageSizeNumber);
  }

  @Post()
  @HttpCode(200)
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ type: User })
  create(@Body() body: CreateUserDto): Promise<User> {
    return this.usersService.create(body);
  }

  @Post('update/:userId')
  @HttpCode(200)
  @ApiParam({ name: 'userId', type: Number })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: User })
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(userId, body);
  }

  @Delete(':userId')
  @ApiParam({ name: 'userId', type: Number })
  @ApiOkResponse({ description: 'User deleted' })
  async delete(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    await this.usersService.delete(userId);
  }
}
