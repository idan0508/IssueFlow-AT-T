import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { TokenDenylistService } from '../token-denylist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tokenDenylist: TokenDenylistService) {
    super({
      // Read the JWT from the Authorization: Bearer <token> header.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'super-secret',
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: { sub: number; username: string; role: string },
  ): {
    id: number;
    username: string;
    role: string;
  } {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    // Denylist blocks tokens that were explicitly revoked at logout.
    if (token && this.tokenDenylist.isRevoked(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // The payload maps to the authenticated user identity and role claims.
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
