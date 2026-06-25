import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService) {}

  @Get('me')
  me(@Req() req: { user: { userId: string; email: string; name?: string } }) {
    return {
      id: req.user.userId,
      email: req.user.email,
      name: req.user.name,
      role: 'super_admin',
    };
  }

  @Get('stats')
  stats() {
    return this.superAdmin.getStats();
  }

  @Get('hotels')
  listHotels() {
    return this.superAdmin.listHotels();
  }

  @Get('hotels/:id')
  getHotel(@Param('id') id: string) {
    return this.superAdmin.getHotel(id);
  }

  @Patch('hotels/:id')
  updateHotel(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      timezone?: string;
      currency?: string;
      is_active?: boolean;
    },
  ) {
    return this.superAdmin.updateHotel(id, body);
  }

  @Get('users')
  listUsers() {
    return this.superAdmin.listUsers();
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: { name?: string; role?: string },
  ) {
    return this.superAdmin.updateUser(id, body);
  }

  @Get('platform-admins')
  listPlatformAdmins() {
    return this.superAdmin.listPlatformAdmins();
  }

  @Post('platform-admins')
  createPlatformAdmin(
    @Body()
    body: { email: string; password: string; name: string },
  ) {
    return this.superAdmin.createPlatformAdmin(body);
  }

  @Patch('platform-admins/:id')
  updatePlatformAdmin(
    @Param('id') id: string,
    @Body()
    body: { name?: string; is_active?: boolean; password?: string },
  ) {
    return this.superAdmin.updatePlatformAdmin(id, body);
  }

  @Get('settings')
  getSettings() {
    return this.superAdmin.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: Record<string, string>) {
    return this.superAdmin.updateSettings(body);
  }
}
