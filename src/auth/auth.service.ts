import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { TokenDenylistService } from './token-denylist.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenDenylist: TokenDenylistService,
  ) {}

  async login(input: LoginDto): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: 3600;
  }> {
    // Look up the user by username to validate credentials.
    const user = await this.usersService.findByUsername(input.username);

    // Plain-text password comparison is temporary for this assignment.
    if (!user || user.password !== input.password) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // JWT payload represents the authenticated subject and its claims.
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    // Token structure matches the API contract: accessToken + Bearer + 1h expiry.
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
    };
  }

  logout(token: string): { message: 'Logout successful' } {
    const decoded = this.jwtService.decode(token) as
      | { exp?: number }
      | null;

    // Record the token until it naturally expires to prevent reuse.
    const expiresAtMs = decoded?.exp
      ? decoded.exp * 1000
      : Date.now() + 3600 * 1000;

    this.tokenDenylist.revoke(token, expiresAtMs);

    return { message: 'Logout successful' };
  }
}
