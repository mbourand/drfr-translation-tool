import { Controller, Post } from '@nestjs/common'

@Controller('smee')
export class SmeeController {
  @Post('target')
  async target() {}
}
