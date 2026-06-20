import { Module } from '@nestjs/common'
import { AuthController } from '@/auth/auth.controller'
import { RoutesModule } from '@/routes/routes.module'

@Module({
  controllers: [AuthController],
  providers: [],
  imports: [RoutesModule]
})
export class AuthModule {}
