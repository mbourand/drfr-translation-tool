import { Cache } from '@nestjs/cache-manager'
import { GithubHttpService } from './http.service'

const noopCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as Cache

type ResponseLike = {
  ok: boolean
  status: number
  statusText: string
  text: () => Promise<string>
}

const response = (init: Partial<ResponseLike> & { ok: boolean; status: number }): ResponseLike => ({
  statusText: '',
  text: () => Promise.resolve(''),
  ...init
})

describe('GithubHttpService.request', () => {
  let service: GithubHttpService
  let fetchMock: jest.Mock

  beforeEach(() => {
    service = new GithubHttpService(noopCache)
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('returns the parsed JSON body on a 2xx response', async () => {
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text: () => Promise.resolve('{"sha":"abc"}') }))

    const result = await service.request<{ sha: string }>('https://api/x')

    expect(result).toEqual({ sha: 'abc' })
  })

  it('returns undefined for an empty body (e.g. 204 No Content)', async () => {
    fetchMock.mockResolvedValue(response({ ok: true, status: 204, text: () => Promise.resolve('') }))

    expect(await service.request('https://api/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('throws on a non-2xx response, naming the operation, status, url and body', async () => {
    fetchMock.mockResolvedValue(
      response({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('Reference already exists')
      })
    )

    await expect(service.request('https://api/refs', { operation: 'create branch' })).rejects.toThrow(
      /create branch.*422.*Unprocessable Entity.*https:\/\/api\/refs.*Reference already exists/s
    )
  })

  it('keeps each call site distinguishable: different operations produce different messages', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 404, statusText: 'Not Found' }))

    await expect(service.request('https://api/a', { operation: 'read original file' })).rejects.toThrow(
      /read original file/
    )
    await expect(service.request('https://api/b', { operation: 'read translated file' })).rejects.toThrow(
      /read translated file/
    )
  })

  it('forwards method, body and authorization to the underlying request', async () => {
    fetchMock.mockResolvedValue(response({ ok: true, status: 201, text: () => Promise.resolve('{}') }))

    await service.request('https://api/x', {
      method: 'POST',
      body: { ref: 'refs/heads/foo' },
      authorization: 'Bearer tok'
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string; headers: Record<string, string> }
    ]
    expect(url).toBe('https://api/x')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ ref: 'refs/heads/foo' }))
    expect(init.headers.Authorization).toBe('Bearer tok')
  })
})
