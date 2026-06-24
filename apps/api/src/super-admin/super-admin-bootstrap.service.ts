import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

@Injectable()
export class SuperAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(private readonly superAdmin: SuperAdminService) {}

  async onModuleInit() {
    await this.superAdmin.ensureDefaultSettings();

    const email =
      process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
      'nayith@origenweb.co';
    const password = process.env.SUPER_ADMIN_PASSWORD;
    const name = process.env.SUPER_ADMIN_NAME ?? 'Nayith Origen Web';

    if (!password) {
      this.logger.warn(
        `SUPER_ADMIN_PASSWORD no configurado — el super admin ${email} no se creó automáticamente`,
      );
      return;
    }

    const admin = await this.superAdmin.bootstrapSuperAdmin(
      email,
      password,
      name,
    );
    this.logger.log(`Super admin listo: ${admin.email}`);
  }
}
