import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(input: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create({
      ...input,
      password: input.password || '',
    });

    return this.usersRepository.save(user);
  }

  async update(id: number, input: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.preload({
      id,
      ...input,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.usersRepository.save(user);
  }

  async delete(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);

    if (!result.affected) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
