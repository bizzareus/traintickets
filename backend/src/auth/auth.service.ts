import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        passwordHash,
      },
    });
    const token = this.jwtService.sign({ sub: user.id });
    return {
      user: { id: user.id, name: user.name, email: user.email },
      accessToken: token,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    )
      throw new UnauthorizedException('Invalid email or password');
    const token = this.jwtService.sign({ sub: user.id });
    return {
      user: { id: user.id, name: user.name, email: user.email },
      accessToken: token,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    return { user };
  }
}
