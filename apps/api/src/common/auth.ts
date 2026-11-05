import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@medforce/core';

export interface AuthUser {
  id: string;
  login: string;
  role: Role;
  codeRp: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Restreint une route à certains rôles (ADMIN a toujours accès). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Jeton manquant');
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7));
      if (payload.typ !== 'access') throw new Error('type');
      req.user = { id: payload.sub, login: payload.login, role: payload.role, codeRp: payload.codeRp } satisfies AuthUser;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles && req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) throw new ForbiddenException('Droits insuffisants');
    return true;
  }
}

/** Rôles « back-office » ayant une vision étendue. */
export const ROLES_SUPERVISION: Role[] = ['ADMIN', 'DPP', 'RESPONSABLE_REGIONAL', 'COORDINATEUR'];
