import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: 1 → confía SOLO en el hop de Caddy, así req.ip resuelve la IP
    // REAL del cliente (la que Caddy agrega a la derecha del X-Forwarded-For) y
    // no la izquierda, que el cliente puede falsear (bypass del rate-limit).
    new FastifyAdapter({ trustProxy: 1 }),
    // rawBody expone req.rawBody (Buffer) para verificar firmas HMAC de webhooks
    { rawBody: true },
  );

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-secret',
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
    // @fastify/cors solo permite GET,HEAD,POST por defecto: sin esto el
    // navegador bloquea PATCH/DELETE con "Failed to fetch"
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CONNECT-HUB API')
    .setDescription(
      'API del panel administrativo sobre el esquema Oracle CONNECT_HUB',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
