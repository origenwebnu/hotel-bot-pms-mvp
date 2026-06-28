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
import { isBusinessVertical } from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SubscriptionService } from '../subscription/subscription.service';

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly subscription: SubscriptionService,
  ) {}

  async sendRegistrationCode(data: {
    email: string;
    password: string;
    passwordConfirm: string;
    name: string;
    hotelName: string;
    businessVertical: string;
  }) {
    const email = data.email.trim().toLowerCase();

    if (!isBusinessVertical(data.businessVertical)) {
      throw new BadRequestException('Tipo de negocio inválido');
    }

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
        businessVertical: data.businessVertical,
        passwordHash,
        expiresAt,
      },
      update: {
        codeHash: this.hashCode(code),
        name: data.name.trim(),
        hotelName: data.hotelName.trim(),
        businessVertical: data.businessVertical,
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
        businessVertical: pending.businessVertical,
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

    await this.subscription.initializeTrialForHotel(hotel.id, hotel.createdAt);

    const user = hotel.users[0];
    return this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      hotelId: hotel.id,
      name: user.name,
    });
  }

  async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase();

    const platformAdmin = await this.prisma.platformAdmin.findUnique({
      where: { email: normalized },
    });

    if (platformAdmin?.isActive) {
      const valid = await bcrypt.compare(password, platformAdmin.passwordHash);
      if (valid) {
        return this.signToken({
          userId: platformAdmin.id,
          email: platformAdmin.email,
          role: 'super_admin',
          name: platformAdmin.name,
        });
      }
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalized },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    return this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      hotelId: user.hotelId,
      name: user.name,
    });
  }

  async getProfile(userId: string, role: string) {
    if (role === 'super_admin') {
      const admin = await this.prisma.platformAdmin.findUnique({
        where: { id: userId },
      });
      if (!admin) throw new UnauthorizedException('Sesión inválida');
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        hotel_id: null,
      };
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: { hotel: { select: { id: true, name: true } } },
    });
    if (!user) throw new UnauthorizedException('Sesión inválida');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hotel_id: user.hotelId,
      hotel_name: user.hotel.name,
    };
  }

  async updateProfile(userId: string, data: { name?: string }) {
    const user = await this.prisma.adminUser.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      },
      include: { hotel: { select: { id: true, name: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hotel_id: user.hotelId,
      hotel_name: user.hotel.name,
    };
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw new UnauthorizedException('Sesión inválida');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 8 caracteres',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  private signToken(params: {
    userId: string;
    email: string;
    role: string;
    hotelId?: string | null;
    name?: string;
  }) {
    const token = this.jwt.sign({
      sub: params.userId,
      email: params.email,
      role: params.role,
      hotelId: params.hotelId ?? null,
      name: params.name,
    });

    return {
      access_token: token,
      role: params.role,
      hotel_id: params.hotelId ?? null,
      name: params.name,
    };
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
