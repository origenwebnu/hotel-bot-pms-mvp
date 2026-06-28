import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RestaurantInventoryService } from './restaurant-inventory.service';

@Controller('hotels/me/restaurant')
@UseGuards(JwtAuthGuard)
export class RestaurantController {
  constructor(private readonly restaurant: RestaurantInventoryService) {}

  @Get('settings')
  getSettings(@Req() req: { user: { hotelId: string } }) {
    return this.restaurant.getSettings(req.user.hotelId);
  }

  @Put('settings')
  updateSettings(
    @Req() req: { user: { hotelId: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.restaurant.updateSettings(req.user.hotelId, body as never);
  }

  @Get('zones')
  listZones(@Req() req: { user: { hotelId: string } }) {
    return this.restaurant.listZones(req.user.hotelId);
  }

  @Post('zones')
  createZone(@Req() req: { user: { hotelId: string } }, @Body() body: never) {
    return this.restaurant.createZone(req.user.hotelId, body);
  }

  @Put('zones/:id')
  updateZone(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.restaurant.updateZone(req.user.hotelId, id, body);
  }

  @Delete('zones/:id')
  deleteZone(@Req() req: { user: { hotelId: string } }, @Param('id') id: string) {
    return this.restaurant.deleteZone(req.user.hotelId, id);
  }

  @Get('addons')
  listAddOns(@Req() req: { user: { hotelId: string } }) {
    return this.restaurant.listAddOns(req.user.hotelId);
  }

  @Post('addons')
  createAddOn(@Req() req: { user: { hotelId: string } }, @Body() body: never) {
    return this.restaurant.createAddOn(req.user.hotelId, body);
  }

  @Put('addons/:id')
  updateAddOn(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.restaurant.updateAddOn(req.user.hotelId, id, body);
  }

  @Delete('addons/:id')
  deleteAddOn(@Req() req: { user: { hotelId: string } }, @Param('id') id: string) {
    return this.restaurant.deleteAddOn(req.user.hotelId, id);
  }

  @Get('calendar')
  listCalendar(
    @Req() req: { user: { hotelId: string } },
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.restaurant.listDateRates(req.user.hotelId, from, to);
  }

  @Put('calendar')
  upsertCalendar(@Req() req: { user: { hotelId: string } }, @Body() body: never) {
    return this.restaurant.upsertDateRate(req.user.hotelId, body);
  }

  @Delete('calendar/:id')
  deleteCalendar(@Req() req: { user: { hotelId: string } }, @Param('id') id: string) {
    return this.restaurant.deleteDateRate(req.user.hotelId, id);
  }
}
