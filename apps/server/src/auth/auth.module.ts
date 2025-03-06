import { Module } from '@nestjs/common'
import { AuthController } from 'src/auth/auth.controller'
import { RoutesModule } from 'src/routes/routes.module'

@Module({
  controllers: [AuthController],
  providers: [],
  imports: [RoutesModule]
})
export class AuthModule {}
