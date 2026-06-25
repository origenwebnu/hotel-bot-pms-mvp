import { IsOptional, IsString } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  pms_provider?: string;

  @IsOptional()
  @IsString()
  pms_property_id?: string;

  @IsOptional()
  @IsString()
  pms_api_key?: string;

  @IsOptional()
  @IsString()
  pms_api_secret?: string;

  @IsOptional()
  @IsString()
  payment_provider?: string;

  @IsOptional()
  @IsString()
  payment_public_key?: string;

  @IsOptional()
  @IsString()
  payment_private_key?: string;

  @IsOptional()
  @IsString()
  payment_webhook_secret?: string;

  @IsOptional()
  @IsString()
  reservation_recommendations?: string;
}
