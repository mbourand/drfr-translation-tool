import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { GithubHttpService } from '@/github/http.service'
import { RoutesService } from '@/routes/routes.service'
import { GithubAuthGuard, AuthedRequest } from './github-auth.guard'

const contextFor = (req: { headers: Record<string, string> }): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext

const makeGuard = (cachedGet: jest.Mock) => {
  const github = { cachedGet } as unknown as GithubHttpService
  const routes = { GITHUB_ROUTES: { AUTHENTICATED_USER: 'https://api/user' } } as unknown as RoutesService
  return new GithubAuthGuard(github, routes)
}

describe('GithubAuthGuard', () => {
  it('rejects a request with no authorization header', async () => {
    const guard = makeGuard(jest.fn())
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('resolves the user from the token and attaches id + login', async () => {
    const cachedGet = jest.fn().mockResolvedValue({ id: 4242, login: 'alice' })
    const guard = makeGuard(cachedGet)
    const req = { headers: { authorization: 'Bearer tok' } } as { headers: Record<string, string> } & {
      user?: AuthedRequest['user']
    }

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true)

    expect(req.user).toEqual({ id: '4242', login: 'alice' })
    expect(cachedGet).toHaveBeenCalledWith('https://api/user', { authorization: 'Bearer tok' })
  })
})
