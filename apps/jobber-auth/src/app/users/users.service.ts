import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput } from './dto/create-user.input';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createUser(createUserInput: CreateUserInput) {
    return this.prismaService.user.create({
      data: {
        ...createUserInput,
        password: await bcrypt.hash(createUserInput.password, 10),
      },
    });
  }

  async getUsers() {
    return this.prismaService.user.findMany();
  }
}
