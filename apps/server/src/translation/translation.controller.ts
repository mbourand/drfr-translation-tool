import { Controller, Get, Req } from '@nestjs/common'
import { Request } from 'express'
import { RoutesService } from 'src/routes/routes.service'

@Controller('translation')
export class TranslationController {
  constructor(private readonly routeService: RoutesService) {}

  @Get('/list')
  async getAllTranslations(@Req() req: Request) {
    const response = await fetch(
      this.routeService.GITHUB_ROUTES.LIST_PULL_REQUESTS('mbourand', 'deltarune-fr') + '?base=master&state=all',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        }
      }
    )

    if (!response.ok) throw new Error(`Failed to fetch data ${response.status} ${response.statusText}`)
    return (await response.json()) as unknown
  }
}
