import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from './types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser =>
    ctx.switchToHttp().getRequest().user,
);
