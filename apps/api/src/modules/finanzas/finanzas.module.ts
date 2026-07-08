import { Module } from '@nestjs/common';
import { OperativaModule } from '../operativa/operativa.module';
import { FinanzasController } from './finanzas.controller';
import { FinanzasService } from './finanzas.service';

@Module({
  imports: [OperativaModule],
  controllers: [FinanzasController],
  providers: [FinanzasService],
})
export class FinanzasModule {}
