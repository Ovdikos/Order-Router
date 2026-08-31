import { IsNumber, IsPositive, IsString } from 'class-validator';
import { IsUuidV7 } from '../validators/is-uuid-v7.validator.js';
import { IsClientId } from '../validators/is-client-id.validator.js';

export class CreateOrderDto {
  @IsUuidV7()
  order_id!: string;

  @IsClientId()
  client_id!: string;

  @IsString()
  currency!: string;

  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'must be a positive number with at most 2 decimal places' },
  )
  @IsPositive()
  amount!: number;
}
