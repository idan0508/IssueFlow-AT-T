import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import {
  ticketWithOverdueArraySchema,
  ticketWithOverdueSchema,
} from './swagger/ticket-schema';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({
    schema: ticketWithOverdueSchema,
  })
  create(
    @Body() body: CreateTicketDto,
    @Req() req: { user: { id: number } },
  ): Promise<Ticket & { isOverdue: boolean }> {
    // Propagate the authenticated user id so the audit log can capture the actor.
    return this.ticketsService.create(body, req.user.id);
  }

  @Post(':ticketId/restore')
  @HttpCode(200)
  @ApiOkResponse({
    schema: ticketWithOverdueSchema,
  })
  restore(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: { user: { id: number; role: string } },
  ): Promise<Ticket & { isOverdue: boolean }> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can access deleted records');
    }

    // Propagate the authenticated user id so the audit log can capture the actor.
    return this.ticketsService.restore(ticketId, req.user.id);
  }

  @Get()
  @ApiQuery({ name: 'projectId', type: Number, required: true })
  @ApiOkResponse({
    schema: ticketWithOverdueArraySchema,
  })
  findAll(
    @Query('projectId', ParseIntPipe) projectId: number,
  ): Promise<Array<Ticket & { isOverdue: boolean }>> {
    return this.ticketsService.findAll(projectId);
  }

  @Get('deleted')
  @ApiQuery({ name: 'projectId', type: Number, required: true })
  @ApiOkResponse({
    schema: ticketWithOverdueArraySchema,
  })
  findDeleted(
    @Query('projectId', ParseIntPipe) projectId: number,
    @Req() req: { user: { role: string } },
  ): Promise<Array<Ticket & { isOverdue: boolean }>> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can access deleted records');
    }

    return this.ticketsService.findDeleted(projectId);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @ApiQuery({ name: 'projectId', type: Number, required: true })
  @ApiOkResponse({
    schema: {
      type: 'string',
      example: 'id,title,description,status,priority,type,dueDate,projectId,assigneeId,isOverdue',
    },
  })
  exportTicketsToCsv(
    @Query('projectId', ParseIntPipe) projectId: number,
  ): Promise<string> {
    return this.ticketsService.exportTicketsToCsv(projectId);
  }

  @Get(':ticketId')
  @ApiOkResponse({
    schema: ticketWithOverdueSchema,
  })
  findOne(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<Ticket & { isOverdue: boolean }> {
    return this.ticketsService.findOne(ticketId);
  }

  @Patch(':ticketId')
  @ApiOkResponse({
    schema: ticketWithOverdueSchema,
  })
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() body: UpdateTicketDto,
    @Req() req: { user: { id: number } },
  ): Promise<Ticket & { isOverdue: boolean }> {
    // Propagate the authenticated user id so the audit log can capture the actor.
    return this.ticketsService.update(ticketId, body, req.user.id);
  }

  @Delete(':ticketId')
  @ApiOkResponse({ description: 'Ticket deleted' })
  async remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: { user: { id: number } },
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // Propagate the authenticated user id so the audit log can capture the actor.
    await this.ticketsService.remove(ticketId, req.user.id);
    return {
      success: true,
      message: `Ticket with ID ${ticketId} was successfully soft-deleted.`,
    };
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import tickets from CSV',
    description:
      'Upload a CSV file without projectId, id, or isOverdue columns. Use the form field projectId instead.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        projectId: { type: 'number', example: 1 },
      },
      required: ['file', 'projectId'],
    },
  })
  @ApiOkResponse({
    schema: {
      example: { created: 2, failed: 1, errors: ['Row 3: status is invalid'] },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid import request',
    schema: {
      examples: {
        missingFile: {
          summary: 'Missing file',
          value: { message: 'file is required' },
        },
        invalidProjectId: {
          summary: 'Invalid projectId',
          value: { message: 'projectId must be a positive integer' },
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project with ID {projectId} not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project with ID 12 not found',
        error: 'Not Found',
      },
    },
  })
  importTicketsFromCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body(
      'projectId',
      new ParseIntPipe({
        exceptionFactory: () =>
          new BadRequestException('projectId must be a positive integer'),
      }),
    )
    projectId: number,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (projectId <= 0) {
      throw new BadRequestException('projectId must be a positive integer');
    }

    return this.ticketsService.importTicketsFromCsv(file.buffer, projectId);
  }
}
