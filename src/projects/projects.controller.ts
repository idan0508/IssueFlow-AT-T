import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOkResponse({ type: Project, isArray: true })
  findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Get('deleted')
  @ApiOkResponse({ type: Project, isArray: true })
  findDeleted(
    @Req() req: { user: { role: string } },
  ): Promise<Project[]> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can access deleted records');
    }

    return this.projectsService.findDeleted();
  }

  @Get(':projectId')
  @ApiOkResponse({ type: Project })
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<Project> {
    return this.projectsService.findOne(projectId);
  }

  @Get(':projectId/workload')
  @ApiOkResponse({
    schema: {
      example: [
        { userId: 1, username: 'Idan', openTicketCount: 3 },
        { userId: 2, username: 'amit', openTicketCount: 5 },
      ],
    },
  })
  getWorkload(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<Array<{ userId: number; username: string; openTicketCount: number }>> {
    return this.projectsService.getWorkload(projectId);
  }

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: Project })
  create(
    @Body() body: CreateProjectDto,
    @Req() req: { user: { id: number } },
  ): Promise<Project> {
    // Propagate the authenticated user id so the audit log can capture the actor.
    return this.projectsService.create(body, req.user.id);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: Project })
  restore(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: { user: { role: string } },
  ): Promise<Project> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can access deleted records');
    }

    return this.projectsService.restore(projectId);
  }

  @Patch(':projectId')
  @ApiOkResponse({ type: Project })
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: UpdateProjectDto,
    @Req() req: { user: { id: number } },
  ): Promise<Project> {
    // Propagate the authenticated user id so the audit log can capture the actor.
    return this.projectsService.update(projectId, body, req.user.id);
  }

  @Delete(':projectId')
  @ApiOkResponse({ description: 'Project deleted' })
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: { user: { id: number } },
  ) {
    // Propagate the authenticated user id so the audit log can capture the actor.
    await this.projectsService.remove(projectId, req.user.id);
    return {
    success: true,
    message: `Project with ID ${projectId} was successfully soft-deleted.`,
   };
  }
}
