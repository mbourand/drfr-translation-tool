import { Module } from '@nestjs/common'
import { TranslationController } from './translation.controller'
import { HttpModule } from '@nestjs/axios'
import { RoutesModule } from 'src/routes/routes.module'

@Module({
  controllers: [TranslationController],
  imports: [HttpModule, RoutesModule]
})
export class TranslationModule {}
