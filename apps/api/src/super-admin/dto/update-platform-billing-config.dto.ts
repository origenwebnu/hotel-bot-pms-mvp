import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePlatformBillingConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  mercadopago_access_token?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  mercadopago_public_key?: string;
}
