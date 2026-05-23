import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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

  @Get(':projectId')
  @ApiOkResponse({ type: Project })
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<Project> {
    return this.projectsService.findOne(projectId);
  }

  @Post()
  @ApiOkResponse({ type: Project })
  create(@Body() body: CreateProjectDto): Promise<Project> {
    return this.projectsService.create(body);
  }

  @Patch(':projectId')
  @ApiOkResponse({ type: Project })
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: UpdateProjectDto,
  ): Promise<Project> {
    return this.projectsService.update(projectId, body);
  }

  @Delete(':projectId')
  @ApiOkResponse({ description: 'Project deleted' })
  async remove(@Param('projectId', ParseIntPipe) projectId: number) {
    await this.projectsService.remove(projectId);
    return {
    success: true,
    message: `Project with ID ${projectId} was successfully soft-deleted.`,
   };
  }
}
