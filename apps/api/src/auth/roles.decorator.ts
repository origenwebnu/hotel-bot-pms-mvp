import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_OWNER = 'owner';
