import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class SendRegistrationCodeDto {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @IsString()
  @MinLength(8)
  passwordConfirm!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  hotelName!: string;
}

class VerifyRegistrationDto {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}

class ResendCodeDto {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register/send-code')
  sendRegistrationCode(@Body() dto: SendRegistrationCodeDto) {
    return this.auth.sendRegistrationCode(dto);
  }

  @Post('register/verify')
  verifyRegistration(@Body() dto: VerifyRegistrationDto) {
    return this.auth.verifyRegistration(dto.email, dto.code);
  }

  @Post('register/resend-code')
  resendRegistrationCode(@Body() dto: ResendCodeDto) {
    return this.auth.resendRegistrationCode(dto.email);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(
    @Req()
    req: { user: { userId: string; role: string } },
  ) {
    return this.auth.getProfile(req.user.userId, req.user.role);
  }
}
