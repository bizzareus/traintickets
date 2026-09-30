import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUserId } from './user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, RegisterDto } from './auth.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  async register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post('login')
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }
}
