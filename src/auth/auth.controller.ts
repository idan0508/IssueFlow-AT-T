import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: '<jwt>',
        tokenType: 'Bearer',
        expiresIn: 3600,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  login(@Body() body: LoginDto): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: 3600;
  }> {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async me(
    @Req() req: Request & { user: { id: number; username: string; role: string } },
  ): Promise<User> {
    // The JWT guard attaches the validated user profile to req.user.
    const authUser = req.user;

    // Fetch the full user record to return consistent API shape.
    return this.usersService.findById(authUser.id);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    schema: {
      example: { message: 'Logout successful' },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  logout(
    @Req() req: Request & { headers: { authorization?: string } },
  ): { message: 'Logout successful' } {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    // Add the active token to the denylist so it cannot be reused.
    return this.authService.logout(token);
  }
}
