import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    name: string;
    hotelName: string;
  }) {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const slug = data.hotelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const passwordHash = await bcrypt.hash(data.password, 12);

    const hotel = await this.prisma.hotel.create({
      data: {
        name: data.hotelName,
        slug: `${slug}-${Date.now()}`,
        integration: { create: {} },
        users: {
          create: {
            email: data.email,
            passwordHash,
            name: data.name,
            role: 'owner',
          },
        },
      },
      include: { users: true },
    });

    const user = hotel.users[0];
    return this.signToken(user.id, user.email, hotel.id);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user.id, user.email, user.hotelId);
  }

  private signToken(userId: string, email: string, hotelId: string) {
    const token = this.jwt.sign({ sub: userId, email, hotelId });
    return { access_token: token, hotel_id: hotelId };
  }
}
