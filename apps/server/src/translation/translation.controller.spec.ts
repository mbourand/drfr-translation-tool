import { Cache } from '@nestjs/cache-manager'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { PullRequestsService } from './pull-requests.service'
import { TranslationController } from './translation.controller'

describe('TranslationController', () => {
  const progressionService = new ProgressionService()
  const controller = new TranslationController(
    {} as unknown as RoutesService,
    {} as unknown as ConfigService<EnvironmentVariables>,
    {} as unknown as GithubHttpService,
    progressionService,
    {} as unknown as RepositoryContext,
    {} as unknown as PullRequestsService,
    {} as unknown as Cache
  )

  it('is defined', () => {
    expect(controller).toBeDefined()
  })

  it('serves progression straight from the ProgressionService (no boot/network side effects)', () => {
    expect(controller.getProgression()).toEqual(progressionService.getProgression())
  })
})
