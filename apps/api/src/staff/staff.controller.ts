import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { staffUserSchema } from '@dantes/shared';
import { AuthService } from '../auth/auth.service';
import { AuditActor, Staff } from '../auth/guards';
import { withPasswordPolicy } from '../common/password-policy';
import { zod } from '../common/zod.pipe';
import { type Actor, AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';

const select = { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true } as const;
type StaffInput = typeof staffUserSchema._output;
const staffBody = withPasswordPolicy(staffUserSchema, ['email']);

@Controller('admin/staff')
@Staff('OWNER')
export class StaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ where: { kind: 'STAFF' }, orderBy: { createdAt: 'asc' }, select });
  }

  @Post()
  async create(@Body(zod(staffBody)) body: StaffInput, @AuditActor() actor: Actor) {
    if (!body.password) throw new BadRequestException({ message: 'Validation failed', issues: [{ path: 'password', message: 'A password is required for new staff' }] });
    if (await this.prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })) throw new ConflictException('That email is already in use');
    const user = await this.prisma.user.create({
      data: { kind: 'STAFF', role: body.role, name: body.name, email: body.email.toLowerCase(), active: body.active, passwordHash: await this.auth.hash(body.password) },
      select,
    });
    await this.audit.log(actor, { action: 'staff.create', entity: 'User', entityId: user.id, after: user });
    return user;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body(zod(staffBody)) body: StaffInput, @AuditActor() actor: Actor) {
    const before = await this.prisma.user.findFirst({ where: { id, kind: 'STAFF' }, select });
    if (!before) throw new NotFoundException('Staff member not found');
    if (id === actor.id && (body.role !== before.role || !body.active)) throw new ConflictException('You cannot change your own role or deactivate yourself');
    const revoke = !body.active || body.role !== before.role || Boolean(body.password);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role,
        active: body.active,
        ...(body.password && { passwordHash: await this.auth.hash(body.password) }),
        ...(revoke && { tokenVersion: { increment: 1 } }),
      },
      select,
    });
    await this.audit.log(actor, { action: 'staff.update', entity: 'User', entityId: id, before, after: user });
    return user;
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(@Param('id') id: string, @AuditActor() actor: Actor) {
    if (id === actor.id) throw new ConflictException('You cannot deactivate yourself');
    const before = await this.prisma.user.findFirst({ where: { id, kind: 'STAFF' }, select });
    if (!before) throw new NotFoundException('Staff member not found');
    const user = await this.prisma.user.update({ where: { id }, data: { active: false, tokenVersion: { increment: 1 } }, select });
    await this.audit.log(actor, { action: 'staff.deactivate', entity: 'User', entityId: id, before, after: user });
    return user;
  }
}
