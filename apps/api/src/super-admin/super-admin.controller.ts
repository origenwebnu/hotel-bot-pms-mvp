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

  @Get('plans')
  listPlans() {
    return this.superAdmin.listSubscriptionPlans();
  }

  @Post('plans')
  createPlan(
    @Body()
    body: {
      name: string;
      max_reservations_per_month: number;
      price_monthly: number;
      currency?: string;
      description?: string;
      sort_order?: number;
    },
  ) {
    return this.superAdmin.createSubscriptionPlan(body);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      max_reservations_per_month?: number;
      price_monthly?: number;
      currency?: string;
      description?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.superAdmin.updateSubscriptionPlan(id, body);
  }

  @Get('hotels/:id/subscription')
  getHotelSubscription(@Param('id') id: string) {
    return this.superAdmin.getHotelSubscription(id);
  }

  @Patch('hotels/:id/subscription')
  assignHotelPlan(
    @Param('id') id: string,
    @Body() body: { plan_id?: string | null; reset_trial?: boolean },
  ) {
    if (body.reset_trial) {
      return this.superAdmin.resetHotelTrial(id);
    }
    return this.superAdmin.assignHotelPlan(id, body.plan_id ?? null);
  }
}
