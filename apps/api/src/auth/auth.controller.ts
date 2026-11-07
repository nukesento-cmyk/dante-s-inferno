import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { customerRegisterSchema, loginSchema } from '@dantes/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { zod } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import type { AuthedRequest } from './auth.types';
import { CurrentStaff, RequireCustomer, Staff } from './guards';
import type { StaffPrincipal } from './auth.types';

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(128) });
const limit = { default: { limit: () => env.loginRateLimit, ttl: () => 60_000 } };

type Login = z.infer<typeof loginSchema>;

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('staff/login')
  @HttpCode(200)
  @Throttle(limit)
  staffLogin(@Body(zod(loginSchema)) body: Login, @Res({ passthrough: true }) res: Response) {
    return this.auth.staffLogin(res, body.email, body.password);
  }

  @Post('staff/logout')
  @HttpCode(200)
  staffLogout(@Res({ passthrough: true }) res: Response) {
    this.auth.clear(res, 'STAFF');
    return { ok: true };
  }

  @Get('staff/me')
  @Staff()
  staffMe(@CurrentStaff() staff: StaffPrincipal) {
    return staff;
  }

  @Post('customer/register')
  @Throttle(limit)
  customerRegister(
    @Body(zod(customerRegisterSchema)) body: z.infer<typeof customerRegisterSchema>,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-cart-token') cartToken?: string,
  ) {
    return this.auth.customerRegister(res, body, cartToken);
  }

  @Post('customer/login')
  @HttpCode(200)
  @Throttle(limit)
  customerLogin(@Body(zod(loginSchema)) body: Login, @Res({ passthrough: true }) res: Response, @Headers('x-cart-token') cartToken?: string) {
    return this.auth.customerLogin(res, body.email, body.password, cartToken);
  }

  @Post('customer/logout')
  @HttpCode(200)
  customerLogout(@Res({ passthrough: true }) res: Response) {
    this.auth.clear(res, 'CUSTOMER');
    return { ok: true };
  }

  @Get('customer/me')
  @RequireCustomer()
  customerMe(@Req() req: AuthedRequest) {
    return this.auth.customerView(req.customer!.userId);
  }

  @Post('customer/forgot-password')
  @HttpCode(200)
  @Throttle(limit)
  async forgot(@Body(zod(forgotSchema)) body: z.infer<typeof forgotSchema>) {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Post('customer/reset-password')
  @HttpCode(200)
  @Throttle(limit)
  async reset(@Body(zod(resetSchema)) body: z.infer<typeof resetSchema>) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }
}
