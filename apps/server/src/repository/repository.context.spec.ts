import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from '@/env'
import { RepositoryContext } from './repository.context'

const configFrom = (values: Record<string, string>): ConfigService<EnvironmentVariables> =>
  ({
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`Missing config ${key}`)
      return values[key]
    }
  }) as unknown as ConfigService<EnvironmentVariables>

const FULL = {
  REPOSITORY_OWNER: 'acme',
  REPOSITORY_NAME: 'deltarune-fr',
  REPOSITORY_MAIN_BRANCH: 'main',
  REPOSITORY_BETA_BRANCH: 'beta'
}

describe('RepositoryContext', () => {
  it('exposes the repository identity as typed properties', () => {
    const ctx = new RepositoryContext(configFrom(FULL))

    expect(ctx.owner).toBe('acme')
    expect(ctx.name).toBe('deltarune-fr')
    expect(ctx.mainBranch).toBe('main')
    expect(ctx.betaBranch).toBe('beta')
  })

  it('validates at construction (startup): a missing value throws immediately, not mid-request', () => {
    const withoutMainBranch = {
      REPOSITORY_OWNER: FULL.REPOSITORY_OWNER,
      REPOSITORY_NAME: FULL.REPOSITORY_NAME,
      REPOSITORY_BETA_BRANCH: FULL.REPOSITORY_BETA_BRANCH
    }

    expect(() => new RepositoryContext(configFrom(withoutMainBranch))).toThrow(/REPOSITORY_MAIN_BRANCH/)
  })
})
