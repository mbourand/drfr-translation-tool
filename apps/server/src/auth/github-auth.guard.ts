import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { GithubHttpService } from 'src/github/http.service'
import { RoutesService } from 'src/routes/routes.service'

/**
 * Resolves the authenticated GitHub user from the request's token and attaches `req.user.id`
 * (the GitHub numeric user id, as a string). This is the single seam tests override to act
 * as a fixed QA without a real token.
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

    const user = await this.githubHttpService.cachedGet<{ id: number }>(this.routesService.GITHUB_ROUTES.AUTHENTICATED_USER, {
      authorization
    })

    ;(req as Request & { user: { id: string } }).user = { id: String(user.id) }
    return true
  }
}
