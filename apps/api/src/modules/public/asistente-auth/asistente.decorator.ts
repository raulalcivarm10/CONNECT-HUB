import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AsistenteUser } from './asistente-jwt';

/** Inyecta el asistente autenticado (lo pone AsistenteJwtGuard en req.asistente). */
export const Asistente = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AsistenteUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ asistente: AsistenteUser }>();
    return req.asistente;
  },
);
