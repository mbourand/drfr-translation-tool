import { Injectable } from '@nestjs/common'

@Injectable()
export class GithubHttpService {
  public async fetch(url: string, options?: { authorization?: string; body?: Record<string, any>; method?: string }) {
    const response = await fetch(url, {
      method: options?.method || 'GET',
      body: options?.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options?.authorization ? { Authorization: options.authorization } : {})
      }
    })

    return response
  }
}
