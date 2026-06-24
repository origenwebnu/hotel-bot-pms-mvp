import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  async sendRegistrationCode(data: {
    email: string;
    password: string;
    passwordConfirm: string;
    name: string;
    hotelName: string;
  }) {
    const email = data.email.trim().toLowerCase();

    if (data.password !== data.passwordConfirm) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Este email ya está registrado');
    }

    const pending = await this.prisma.registrationVerification.findUnique({
      where: { email },
    });

    if (pending) {
      const sinceLastMs = Date.now() - pending.createdAt.getTime();
      if (sinceLastMs < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - sinceLastMs) / 1000);
        throw new BadRequestException(
          `Espera ${waitSec} segundos antes de solicitar otro código`,
        );
      }
    }

    const code = String(randomInt(100000, 1000000));
    const passwordHash = await bcrypt.hash(data.password, 12);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.registrationVerification.upsert({
      where: { email },
      create: {
        email,
        codeHash: this.hashCode(code),
        name: data.name.trim(),
        hotelName: data.hotelName.trim(),
        passwordHash,
        expiresAt,
      },
      update: {
        codeHash: this.hashCode(code),
        name: data.name.trim(),
        hotelName: data.hotelName.trim(),
        passwordHash,
        expiresAt,
        createdAt: new Date(),
      },
    });

    await this.email.sendRegistrationCode(email, code, data.hotelName.trim());

    return {
      message: 'Código enviado a tu email. Expira en 15 minutos.',
      email,
      expires_in_seconds: CODE_TTL_MS / 1000,
    };
  }

  async resendRegistrationCode(email: string) {
    const normalized = email.trim().toLowerCase();
    const pending = await this.prisma.registrationVerification.findUnique({
      where: { email: normalized },
    });

    if (!pending) {
      throw new NotFoundException(
        'No hay un registro pendiente. Completa el formulario de nuevo.',
      );
    }

    if (pending.expiresAt < new Date()) {
      await this.prisma.registrationVerification.delete({
        where: { email: normalized },
      });
      throw new BadRequestException(
        'El código expiró. Completa el formulario de registro de nuevo.',
      );
    }

    const sinceLastMs = Date.now() - pending.createdAt.getTime();
    if (sinceLastMs < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - sinceLastMs) / 1000);
      throw new BadRequestException(
        `Espera ${waitSec} segundos antes de reenviar el código`,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.registrationVerification.update({
      where: { email: normalized },
      data: {
        codeHash: this.hashCode(code),
        expiresAt,
        createdAt: new Date(),
      },
    });

    await this.email.sendRegistrationCode(
      normalized,
      code,
      pending.hotelName,
    );

    return {
      message: 'Nuevo código enviado. Expira en 15 minutos.',
      expires_in_seconds: CODE_TTL_MS / 1000,
    };
  }

  async verifyRegistration(email: string, code: string) {
    const normalized = email.trim().toLowerCase();
    const pending = await this.prisma.registrationVerification.findUnique({
      where: { email: normalized },
    });

    if (!pending) {
      throw new BadRequestException(
        'No hay registro pendiente. Solicita un código primero.',
      );
    }

    if (pending.expiresAt < new Date()) {
      await this.prisma.registrationVerification.delete({
        where: { email: normalized },
      });
      throw new BadRequestException(
        'El código expiró. Solicita uno nuevo desde el formulario de registro.',
      );
    }

    if (!this.verifyCode(code.trim(), pending.codeHash)) {
      throw new BadRequestException('Código incorrecto');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      await this.prisma.registrationVerification.delete({
        where: { email: normalized },
      });
      throw new ConflictException('Este email ya está registrado');
    }

    const slug = pending.hotelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const hotel = await this.prisma.hotel.create({
      data: {
        name: pending.hotelName,
        slug: `${slug}-${Date.now()}`,
        integration: { create: {} },
        users: {
          create: {
            email: normalized,
            passwordHash: pending.passwordHash,
            name: pending.name,
            role: 'owner',
          },
        },
      },
      include: { users: true },
    });

    await this.prisma.registrationVerification.delete({
      where: { email: normalized },
    });

    const user = hotel.users[0];
    return this.signToken(user.id, user.email, hotel.id);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    return this.signToken(user.id, user.email, user.hotelId);
  }

  private signToken(userId: string, email: string, hotelId: string) {
    const token = this.jwt.sign({ sub: userId, email, hotelId });
    return { access_token: token, hotel_id: hotelId };
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private verifyCode(code: string, hash: string): boolean {
    const a = Buffer.from(this.hashCode(code));
    const b = Buffer.from(hash);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
