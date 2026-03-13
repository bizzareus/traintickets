import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUserId } from './user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      phone?: string;
    },
  ) {
    return this.auth.register(body);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }
}
