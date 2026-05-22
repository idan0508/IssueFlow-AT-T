import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenDenylistService {
  private readonly revokedTokens = new Map<string, number>();

  revoke(token: string, expiresAtMs: number): void {
    // Store the token until its natural expiration time.
    this.revokedTokens.set(token, expiresAtMs);
  }

  isRevoked(token: string): boolean {
    const expiresAtMs = this.revokedTokens.get(token);

    if (!expiresAtMs) {
      return false;
    }

    // Clean up expired entries so the list does not grow forever.
    if (Date.now() >= expiresAtMs) {
      this.revokedTokens.delete(token);
      return false;
    }

    return true;
  }
}
