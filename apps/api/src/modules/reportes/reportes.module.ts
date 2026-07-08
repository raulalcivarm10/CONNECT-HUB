import { Module } from '@nestjs/common';
import { OperativaModule } from '../operativa/operativa.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [OperativaModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
