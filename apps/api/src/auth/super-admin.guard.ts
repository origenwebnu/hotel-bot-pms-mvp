import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ROLE_SUPER_ADMIN } from './roles.decorator';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== ROLE_SUPER_ADMIN) {
      throw new ForbiddenException('Acceso restringido a super administradores');
    }
    return true;
  }
}
