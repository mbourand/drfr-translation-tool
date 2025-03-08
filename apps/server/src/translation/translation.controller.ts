import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { IsString, MaxLength, MinLength } from 'class-validator'
import * as dayjs from 'dayjs'
import { Request } from 'express'
import { RoutesService } from 'src/routes/routes.service'

class CreateTranslationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(80)
  name: string
}

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

  @Post('/')
  async createTranslation(@Req() req: Request, @Body() body: CreateTranslationDto) {
    const lastMasterCommitResponse = await fetch(
      this.routeService.GITHUB_ROUTES.COMMITS('mbourand', 'deltarune-fr', 'master'),
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        }
      }
    )

    if (!lastMasterCommitResponse.ok)
      throw new Error(
        `Failed to retrieve last commit ${lastMasterCommitResponse.status} ${lastMasterCommitResponse.statusText}`
      )

    const lastMasterCommit = (await lastMasterCommitResponse.json()) as { sha: string }

    const now = dayjs()

    const head = now.format('YYYY-MM-DD-HH-mm-ss-SSS')
    const ref = `refs/heads/${head}`

    const refCreationResponse = await fetch(this.routeService.GITHUB_ROUTES.CREATE_REF('mbourand', 'deltarune-fr'), {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
      },
      body: JSON.stringify({ ref, sha: lastMasterCommit.sha })
    })

    if (!refCreationResponse.ok)
      throw new Error(
        `Failed to create branch ${refCreationResponse.status} ${refCreationResponse.statusText} ${await refCreationResponse.text()}`
      )

    const branchIdentifierContentsResponse = await fetch(
      this.routeService.GITHUB_ROUTES.READ_FILE('mbourand', 'deltarune-fr', '.branch-identifier') + `?ref=${head}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        }
      }
    )

    if (!branchIdentifierContentsResponse.ok)
      throw new Error(
        `Failed to read branch identifier ${branchIdentifierContentsResponse.status} ${branchIdentifierContentsResponse.statusText} ${await branchIdentifierContentsResponse.text()}`
      )

    const branchIdentifierContents = (await branchIdentifierContentsResponse.json()) as { sha: string }

    // Edit readme.md to add the branch name at the end
    const editionReponse = await fetch(
      this.routeService.GITHUB_ROUTES.EDIT_FILE('mbourand', 'deltarune-fr', '.branch-identifier'),
      {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        },
        body: JSON.stringify({
          message: `Branch identifier for ${head}`,
          content: Buffer.from(head).toString('base64'),
          branch: head,
          sha: branchIdentifierContents.sha
        })
      }
    )

    if (!editionReponse.ok)
      throw new Error(
        `Failed to edit branch identifier ${editionReponse.status} ${editionReponse.statusText} ${await editionReponse.text()}`
      )

    const pullRequestCreationResponse = await fetch(
      this.routeService.GITHUB_ROUTES.CREATE_PULL_REQUEST('mbourand', 'deltarune-fr'),
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        },
        body: JSON.stringify({ title: body.name, head, base: 'master' })
      }
    )

    if (!pullRequestCreationResponse.ok)
      throw new Error(
        `Failed to create PR ${pullRequestCreationResponse.status} ${pullRequestCreationResponse.statusText} ${await pullRequestCreationResponse.text()}`
      )

    const pullRequest = (await pullRequestCreationResponse.json()) as { number: number }

    const addLabelResponse = await fetch(
      this.routeService.GITHUB_ROUTES.ADD_LABEL('mbourand', 'deltarune-fr', pullRequest.number),
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        },
        body: JSON.stringify(['Traduction', 'En cours'])
      }
    )

    if (!addLabelResponse.ok)
      throw new Error(
        `Failed to add label to PR ${addLabelResponse.status} ${addLabelResponse.statusText} ${await addLabelResponse.text()}`
      )

    return pullRequest
  }
}
