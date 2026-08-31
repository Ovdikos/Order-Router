import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { RouteOrderCommand } from './commands/route-order.command.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  createOrder(@Body() dto: CreateOrderDto): Promise<{ status: string; order_id: string }> {
    return this.commandBus.execute(
      new RouteOrderCommand(dto.order_id, dto.client_id, dto.currency, dto.amount),
    );
  }
}
