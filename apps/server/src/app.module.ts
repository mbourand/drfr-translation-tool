import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { resolve } from 'path'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { SmeeModule } from './smee/smee.module'
import { RoutesModule } from './routes/routes.module'
import { plainToInstance } from 'class-transformer'
import { EnvironmentVariables } from '@/env'
import { TranslationModule } from './translation/translation.module'
import { CacheModule } from '@nestjs/cache-manager'
import { GithubModule } from './github/github.module'
import { PrismaModule } from './prisma/prisma.module'
import { BetaReviewsModule } from './beta-reviews/beta-reviews.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => plainToInstance(EnvironmentVariables, config)
    }),
    // Serve stored screenshots publicly (no auth) at `/screenshots/...` so GitHub's Camo proxy and the
    // desktop app can load them. Filenames are content-unique, so responses are safely immutable for a year.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => [
        {
          rootPath: resolve(configService.getOrThrow('SCREENSHOTS_DIR', { infer: true })),
          serveRoot: '/screenshots',
          serveStaticOptions: { index: false, immutable: true, maxAge: '1y' }
        }
      ]
    }),
    CacheModule.register({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    SmeeModule,
    RoutesModule,
    TranslationModule,
    GithubModule,
    BetaReviewsModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
