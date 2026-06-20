import { Test, TestingModule } from '@nestjs/testing'
import { SmeeController } from './smee.controller'

describe('SmeeController', () => {
  let controller: SmeeController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmeeController]
    }).compile()

    controller = module.get<SmeeController>(SmeeController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
