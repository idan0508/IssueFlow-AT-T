import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
  ) {}

  async create(input: CreateProjectDto): Promise<Project> {
    const project = this.projectsRepository.create({
      name: input.name,
      description: input.description,
      // Map ownerId to the relation without an extra user lookup.
      owner: { id: input.ownerId },
    });

    return this.projectsRepository.save(project);
  }

  findAll(): Promise<Project[]> {
    return this.projectsRepository.find({ relations: { owner: true } });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { owner: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async update(id: number, input: UpdateProjectDto): Promise<Project> {
    const project = await this.projectsRepository.preload({
      id,
      ...input,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return this.projectsRepository.save(project);
  }

  async remove(id: number): Promise<void> {
    // Soft delete keeps the record for restore flows and audit needs.
    const result = await this.projectsRepository.softDelete(id);

    if (!result.affected) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
  }
}
