import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Roles de ROLES_INSTITUCIONES que pueden acceder; el superadmin siempre pasa */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
