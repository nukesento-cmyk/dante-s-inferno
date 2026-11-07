import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@prisma/client';
import type { Actor } from '../core/audit.service';
import { AuthService } from './auth.service';
import type { AuthedRequest } from './auth.types';

const ROLES_KEY = 'staffRoles';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.staff ??= (await this.auth.staffFromRequest(req)) ?? undefined;
    if (!req.staff) throw new UnauthorizedException('Sign in required');
    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.staff.role)) throw new ForbiddenException('Your role cannot do this');
    return true;
  }
}

/** Requires a staff session; with roles, only those roles (method-level overrides class-level). */
export const Staff = (...roles: StaffRole[]) => applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(StaffGuard));

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.customer ??= await this.auth.customerFromRequest(req);
    if (!req.customer) throw new UnauthorizedException('Sign in required');
    return true;
  }
}

export const RequireCustomer = () => UseGuards(CustomerGuard);

export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().staff);

export const AuditActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return { id: req.staff?.id ?? null, ip: req.ip };
});
