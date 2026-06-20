import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from './../src/app.module'

describe('AppController (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(() => {
    // Don't spawn the smee webhook-forwarding child process during tests — it stays connected to
    // smee.io and would keep the jest worker alive at teardown ("failed to exit gracefully"). Set
    // before AppModule compiles. Mirrors beta-reviews.e2e-spec.
    process.env.ENABLE_SMEE = 'false'
  })

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app?.close()
  })

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!')
  })
})
