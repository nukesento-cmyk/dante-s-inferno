import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { PrismaService } from '../core/prisma.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { CUSTOMER_COOKIE, type CustomerPrincipal, STAFF_COOKIE, type StaffPrincipal } from './auth.types';

type Kind = 'STAFF' | 'CUSTOMER';
const STAFF_TTL_S = 12 * 3600;
const CUSTOMER_TTL_S = 30 * 24 * 3600;
/** argon2id, 19 MiB / 2 passes is the OWASP minimum; we use 64 MiB / 3 passes. */
export const ARGON2 = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
let dummyHash: Promise<string> | undefined;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailProvider,
  ) {}

  hash(password: string) {
    return argon2.hash(password, ARGON2);
  }

  private async checkCredentials(kind: Kind, email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always run one argon2 verification so an unknown email costs the same as a wrong password (no timing oracle).
    dummyHash ??= argon2.hash('dummy-password-for-timing', ARGON2);
    const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), password).catch(() => false);
    const ok = user && valid && user.kind === kind && user.active;
    if (!ok) throw new UnauthorizedException('Invalid email or password');
    const rehash = argon2.needsRehash(user.passwordHash, ARGON2);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(rehash && { passwordHash: await this.hash(password) }) } });
    return user;
  }

  private issue(res: Response, kind: Kind, user: User) {
    const ttl = kind === 'STAFF' ? STAFF_TTL_S : CUSTOMER_TTL_S;
    const token = this.jwt.sign({ sub: user.id, tv: user.tokenVersion, kind }, { expiresIn: ttl });
    res.cookie(kind === 'STAFF' ? STAFF_COOKIE : CUSTOMER_COOKIE, token, { ...this.cookieOptions(), maxAge: ttl * 1000 });
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: env.isProduction, path: '/' };
  }

  clear(res: Response, kind: Kind) {
    res.clearCookie(kind === 'STAFF' ? STAFF_COOKIE : CUSTOMER_COOKIE, this.cookieOptions());
  }

  private async userFromToken(token: string | undefined, kind: Kind): Promise<User | null> {
    if (!token) return null;
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; tv: number; kind: Kind }>(token);
      if (p.kind !== kind) return null;
      const user = await this.prisma.user.findUnique({ where: { id: p.sub } });
      return user && user.active && user.kind === kind && user.tokenVersion === p.tv ? user : null;
    } catch {
      return null;
    }
  }

  async staffFromRequest(req: Request): Promise<StaffPrincipal | null> {
    const user = await this.userFromToken(req.cookies?.[STAFF_COOKIE], 'STAFF');
    return user?.role ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
  }

  async customerFromRequest(req: Request): Promise<CustomerPrincipal | null> {
    const user = await this.userFromToken(req.cookies?.[CUSTOMER_COOKIE], 'CUSTOMER');
    if (!user) return null;
    const customer = await this.prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return null;
    return { userId: user.id, customerId: customer.id, name: user.name, email: user.email, phone: customer.phone };
  }

  async staffLogin(res: Response, email: string, password: string) {
    const user = await this.checkCredentials('STAFF', email, password);
    this.issue(res, 'STAFF', user);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async customerRegister(res: Response, input: { name: string; email: string; phone: string; password: string }, cartToken?: string) {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const user = await this.prisma.user.create({
      data: {
        kind: 'CUSTOMER',
        email,
        name: input.name,
        phone: input.phone,
        passwordHash: await this.hash(input.password),
        customer: { create: { name: input.name, phone: input.phone, email } },
      },
    });
    this.issue(res, 'CUSTOMER', user);
    await this.attachCart(user.id, cartToken);
    return this.customerView(user.id);
  }

  async customerLogin(res: Response, email: string, password: string, cartToken?: string) {
    const user = await this.checkCredentials('CUSTOMER', email, password);
    this.issue(res, 'CUSTOMER', user);
    await this.attachCart(user.id, cartToken);
    return this.customerView(user.id);
  }

  async customerView(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { customer: true } });
    return { id: user.id, name: user.name, email: user.email, phone: user.customer?.phone ?? user.phone };
  }

  private async attachCart(userId: string, token?: string) {
    if (!token) return;
    await this.prisma.cart.updateMany({ where: { token, userId: null }, data: { userId } });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.kind !== 'CUSTOMER' || !user.active) return;
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 3600_000) },
    });
    const link = `${env.storefrontUrl}/reset-password?token=${token}`;
    // Not awaited: the response time must not reveal whether the address has an account.
    void this.email
      .send(user.email, "Reset your Dante's Pizza password", `Hi ${user.name},\n\nReset your password here (valid for 1 hour): ${link}\n\nIf you did not ask for this, ignore this email.`)
      .catch(() => undefined);
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetTokenHash: sha256(token), resetTokenExpires: { gt: new Date() }, kind: 'CUSTOMER' },
    });
    if (!user) throw new BadRequestException('This reset link is invalid or has expired');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.hash(password), resetTokenHash: null, resetTokenExpires: null, tokenVersion: { increment: 1 } },
    });
  }
}
