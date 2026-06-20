import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { GithubHttpService } from '@/github/http.service'
import { RoutesService } from '@/routes/routes.service'

/** The authenticated GitHub identity the guard resolves and attaches to the request. */
export type AuthedUser = { id: string; login: string }
export type AuthedRequest = Request & { user: AuthedUser }

/**
 * Resolves the authenticated GitHub user from the request's token and attaches `req.user`:
 * `id` (the numeric user id, as a string) for Beta QA review marks, and `login` for PR sign-offs.
 * This is the single seam tests override to act as a fixed user without a real token.
 */
@Injectable()
export class GithubAuthGuard implements CanActivate {
  constructor(
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const authorization = req.headers.authorization
    if (!authorization) throw new UnauthorizedException('Missing authorization header')

    const user = await this.githubHttpService.cachedGet<{ id: number; login: string }>(
      this.routesService.GITHUB_ROUTES.AUTHENTICATED_USER,
      {
        authorization
      }
    )

    ;(req as AuthedRequest).user = { id: String(user.id), login: user.login }
    return true
  }
}
