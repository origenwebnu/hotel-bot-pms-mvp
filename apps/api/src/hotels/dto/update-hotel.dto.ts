import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const CURRENCIES = ['COP', 'USD', 'EUR', 'MXN'] as const;

const TIMEZONES = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Buenos_Aires',
  'America/New_York',
  'Europe/Madrid',
] as const;

export class UpdateHotelDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(TIMEZONES)
  timezone?: string;

  @IsOptional()
  @IsString()
  @IsIn(CURRENCIES)
  currency?: string;
}
