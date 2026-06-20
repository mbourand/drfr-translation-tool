import { Module } from '@nestjs/common'
import { RepositoryContext } from './repository.context'

@Module({
  providers: [RepositoryContext],
  exports: [RepositoryContext]
})
export class RepositoryModule {}
