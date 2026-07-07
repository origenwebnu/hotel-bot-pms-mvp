import { IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { ServiceHoursMap } from '@hotel-bot/shared';

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

  @IsOptional()
  @IsEmail()
  chat_notification_email?: string;

  @IsOptional()
  @IsObject()
  service_hours_json?: ServiceHoursMap;
}
