import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Comment } from '../comments/entities/comment.entity';

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

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

  async getMentions(userId: number, page: number = 1, pageSize: number = 10) {
    const user = await this.findById(userId);

    const skip = (page - 1) * pageSize;

    const [comments, total] = await this.usersRepository.manager.findAndCount(Comment, {
      where: { content: ILike(`%@${user.username}%`) },
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    
    const data = await Promise.all(
      comments.map(async (c) => {
        const matches = c.content.matchAll(MENTION_REGEX);
        const extractedUsernames = Array.from(new Set(Array.from(matches, (m) => m[1].toLowerCase())));

        let mentionedUsers: Array<{ id: number; username: string; fullName: string }> = [];

        if (extractedUsernames.length > 0) {
          const users = await this.usersRepository
            .createQueryBuilder('u')
            .select(['u.id', 'u.username', 'u.fullName'])
            .where('LOWER(u.username) IN (:...usernames)', { usernames: extractedUsernames })
            .getMany();

          mentionedUsers = users.map((u) => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
          }));
        }

        return {
          id: c.id,
          ticketId: c.ticketId,
          authorId: c.authorId,
          content: c.content,
          mentionedUsers,
        };
      }),
    );

    return { data, total, page };
  }
}
