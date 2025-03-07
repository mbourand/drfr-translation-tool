import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from 'src/env'

@Injectable()
export class RoutesService {
  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  public get GITHUB_ROUTES() {
    const baseUrl = this.configService.get('GITHUB_BASE_URL', { infer: true })
    const apiBaseUrl = this.configService.get('GITHUB_API_BASE_URL', { infer: true })

    return {
      ACCESS_TOKEN: `${baseUrl}/login/oauth/access_token`,
      AUTHENTICATED_USER: `${apiBaseUrl}/user`,
      LIST_PULL_REQUESTS: (owner: string, repo: string) => `${apiBaseUrl}/repos/${owner}/${repo}/pulls`
    } as const
  }
}
