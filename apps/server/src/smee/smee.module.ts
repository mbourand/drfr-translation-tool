import { Module } from '@nestjs/common'
import { SmeeService } from 'src/smee/smee.service'
import { SmeeController } from './smee.controller'

@Module({
  controllers: [SmeeController],
  providers: [SmeeService],
  imports: []
})
export class SmeeModule {}
