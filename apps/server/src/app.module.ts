import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { ConfigModule } from '@nestjs/config'
import { SmeeModule } from './smee/smee.module'
import { RoutesModule } from './routes/routes.module'
import { plainToInstance } from 'class-transformer'
import { EnvironmentVariables } from 'src/env'
import { TranslationModule } from './translation/translation.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => plainToInstance(EnvironmentVariables, config)
    }),
    AuthModule,
    SmeeModule,
    RoutesModule,
    TranslationModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
