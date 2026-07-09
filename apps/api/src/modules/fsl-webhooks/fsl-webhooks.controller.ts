import { Controller, Post, RawBodyRequest, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { FslWebhooksService } from './fsl-webhooks.service';

/**
 * Receptor de webhooks de FourStackLabs. Público (sin JWT): la autenticidad se
 * valida con la firma HMAC del header X-FSL-Signature. Usa el cuerpo CRUDO
 * (req.rawBody) para verificar la firma.
 */
@ApiExcludeController()
@Controller('fsl/webhooks')
export class FslWebhooksController {
  constructor(private readonly service: FslWebhooksService) {}

  @Post()
  async recibir(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Res() reply: FastifyReply,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const firma = req.headers['x-fsl-signature'] as string | undefined;
    const eventId = req.headers['x-fsl-event-id'] as string | undefined;
    const { status, body } = await this.service.procesar(raw, firma, eventId);
    await reply.status(status).send(body);
  }
}
