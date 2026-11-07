import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { cartItemInputSchema, cartItemUpdateSchema, FULFILMENT_TYPES } from '@dantes/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';
import { CartService } from './cart.service';
import { LinePricingService } from './line-pricing.service';

const quoteSchema = z.object({ fulfilment: z.enum(FULFILMENT_TYPES), deliveryZoneId: z.string().optional() });

@Controller('cart')
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly pricing: LinePricingService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private async userId(req: Request) {
    return (await this.auth.customerFromRequest(req))?.userId;
  }

  @Post()
  async create(@Req() req: Request) {
    return this.carts.create(await this.userId(req));
  }

  @Get()
  async get(@Req() req: Request, @Headers('x-cart-token') token?: string) {
    return this.carts.view(await this.carts.find(token, await this.userId(req)));
  }

  @Post('items')
  async add(@Req() req: Request, @Body(zod(cartItemInputSchema)) body: z.infer<typeof cartItemInputSchema>, @Headers('x-cart-token') token?: string) {
    return this.carts.addItem(token, await this.userId(req), body);
  }

  @Patch('items/:id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(zod(cartItemUpdateSchema)) body: z.infer<typeof cartItemUpdateSchema>,
    @Headers('x-cart-token') token?: string,
  ) {
    return this.carts.updateItem(token, await this.userId(req), id, body);
  }

  @Delete('items/:id')
  async remove(@Req() req: Request, @Param('id') id: string, @Headers('x-cart-token') token?: string) {
    return this.carts.removeItem(token, await this.userId(req), id);
  }

  @Post('quote')
  @HttpCode(200)
  async quote(@Req() req: Request, @Body(zod(quoteSchema)) body: z.infer<typeof quoteSchema>, @Headers('x-cart-token') token?: string) {
    const cart = await this.carts.find(token, await this.userId(req));
    const resolved = await this.carts.resolveCart(cart);
    const totals = resolved.flatMap(({ line }) => (line.ok ? [line.lineTotalCents] : []));
    const zone = body.deliveryZoneId ? await this.prisma.deliveryZone.findUnique({ where: { id: body.deliveryZoneId } }) : null;
    return this.pricing.priceOrder(totals, body.fulfilment, zone);
  }
}
