import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ClientBlockedException } from '../exceptions/client-blocked.exception.js';
import { InvalidOrderDateException } from '../exceptions/invalid-order-date.exception.js';
import { RoutingRejectedException } from '../exceptions/routing-rejected.exception.js';

@Catch(ClientBlockedException, RoutingRejectedException, InvalidOrderDateException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ClientBlockedException) {
      response.status(HttpStatus.FORBIDDEN).json({
        error: 'CLIENT_BLOCKED',
        client_id: exception.clientId,
      });
      return;
    }

    if (exception instanceof RoutingRejectedException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: 'ROUTING_REJECTED',
        ...exception.details,
      });
      return;
    }

    if (exception instanceof InvalidOrderDateException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: 'ROUTING_REJECTED',
        reason: 'INVALID_ORDER_DATE',
        order_id: exception.orderId,
        extracted_date: exception.extractedDate,
      });
    }
  }
}
