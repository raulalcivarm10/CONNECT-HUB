import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { JwtUser } from '../../auth/types';
import { AuditoriaService, resumirBody } from './auditoria.service';

/** rutas ruidosas que no aportan a la auditoría */
const OMITIR = ['/health', '/auth/refresh', '/auth/me', '/auth/logout'];
const MUTACIONES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function accionDe(metodo: string, ruta: string, fallo: boolean): string {
  // logins del panel Y de la app móvil
  if (
    ruta.startsWith('/auth/login') ||
    /^\/public\/auth\/(login|google|apple)$/.test(ruta)
  ) {
    return fallo ? 'LOGIN_FAIL' : 'LOGIN_OK';
  }
  if (fallo) return 'ERROR';
  // Acciones SEMÁNTICAS (máx 20 chars — VARCHAR2(20)): el flujo de aprobación
  // y la gestión sensible dejan de salir como CREATE/UPDATE genéricos.
  if (/^\/eventos\/\d+\/aprobar-salon$/.test(ruta)) return 'APROBAR_SALON';
  if (/^\/eventos\/\d+\/aprobar-publicacion$/.test(ruta)) return 'PUBLICAR';
  if (/^\/eventos\/\d+\/rechazar$/.test(ruta)) return 'RECHAZAR_EVENTO';
  if (/^\/eventos\/\d+\/destacar$/.test(ruta)) return 'DESTACAR';
  if (/^\/eventos\/\d+\/suspender$/.test(ruta)) return 'SUSPENDER_EVENTO';
  if (/^\/eventos\/\d+\/republicar$/.test(ruta)) return 'REPUBLICAR';
  if (/^\/usuarios\/[^/]+\/roles$/.test(ruta)) return 'CAMBIO_ROLES';
  if (/^\/usuarios\/[^/]+\/estado$/.test(ruta)) return 'USUARIO_ESTADO';
  if (/^\/instituciones\/\d+\/aprobar$/.test(ruta)) return 'INST_APROBAR';
  if (/^\/instituciones\/\d+\/rechazar$/.test(ruta)) return 'INST_RECHAZAR';
  if (/^\/instituciones\/\d+\/suspender$/.test(ruta)) return 'INST_SUSPENDER';
  if (/^\/instituciones\/\d+\/reactivar$/.test(ruta)) return 'INST_REACTIVAR';
  if (metodo === 'DELETE') return 'DELETE';
  if (metodo === 'PATCH' || metodo === 'PUT') return 'UPDATE';
  return 'CREATE';
}

/**
 * Auditoría global: registra logins (OK/FAIL), toda mutación y sus errores.
 * Los GET solo se registran si fallan con 5xx (evita ruido de tokens vencidos).
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(private readonly auditoria: AuditoriaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: JwtUser }>();
    const metodo = req.method.toUpperCase();
    const ruta = req.url.split('?')[0];
    const esMutacion = MUTACIONES.has(metodo);
    if (OMITIR.some((p) => ruta.startsWith(p))) return next.handle();

    const xff = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0].trim() ?? req.ip;
    const body = req.body as Record<string, unknown> | undefined;

    const registrar = (status: number, fallo: boolean, extra?: string) => {
      // GET exitosos o con 4xx no se auditan; sí sus 5xx
      if (!esMutacion && (!fallo || status < 500)) return;
      const usuario =
        req.user?.sub ??
        (typeof body?.usuario === 'string' ? body.usuario.toUpperCase() : null);
      const detalle = [resumirBody(body), extra].filter(Boolean).join(' | ');
      this.auditoria.registrar({
        usuario,
        idInstitucion: req.user?.idInstitucion ?? null,
        accion: accionDe(metodo, ruta, fallo),
        metodo,
        ruta,
        status,
        ip,
        detalle: detalle || null,
      });
    };

    const res = ctx.switchToHttp().getResponse<FastifyReply>();
    return next.handle().pipe(
      tap(() => {
        // con @Res el controlador fija el status manualmente (p. ej. webhooks)
        const status = res.statusCode ?? 200;
        registrar(status, status >= 400);
      }),
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const msg =
          err instanceof Error ? err.message.slice(0, 300) : String(err);
        registrar(status, true, msg);
        return throwError(() => err);
      }),
    );
  }
}
