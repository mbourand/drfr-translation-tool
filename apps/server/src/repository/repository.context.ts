import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from '@/env'

/**
 * Typed, validated-once view of the repository the server operates on.
 *
 * The four `REPOSITORY_*` env vars are read with `getOrThrow` at construction (module init), so a
 * missing value fails the boot rather than a request deep in a flow. Call sites read `.owner` /
 * `.mainBranch` instead of repeating string config keys ~34 times across the controllers.
 */
@Injectable()
export class RepositoryContext {
  readonly owner: string
  readonly name: string
  readonly mainBranch: string
  readonly betaBranch: string

  constructor(configService: ConfigService<EnvironmentVariables>) {
    this.owner = configService.getOrThrow('REPOSITORY_OWNER', { infer: true })
    this.name = configService.getOrThrow('REPOSITORY_NAME', { infer: true })
    this.mainBranch = configService.getOrThrow('REPOSITORY_MAIN_BRANCH', { infer: true })
    this.betaBranch = configService.getOrThrow('REPOSITORY_BETA_BRANCH', { infer: true })
  }
}
