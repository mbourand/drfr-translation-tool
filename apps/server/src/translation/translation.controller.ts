import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Body, Controller, Delete, Get, Inject, Logger, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Type } from 'class-transformer'
import { IsArray, IsString, ValidateNested } from 'class-validator'
import { Request } from 'express'
import { AuthedRequest, GithubAuthGuard } from '@/auth/github-auth.guard'
import { CACHE_KEYS } from '@/cache/cache.constants'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { PullRequestsService } from './pull-requests.service'
import { ReviewSignoffs } from './review-signoffs'
import { translationFiles } from './translation-files'

class CreateTranslationDto {
  // @IsString()
  // @MinLength(5)
  // @MaxLength(80)
  name: string
}

class SaveFilesFileDto {
  @IsString()
  path: string

  @IsString()
  content: string
}

class SaveFilesBodyDto {
  @IsString()
  branch: string

  @IsString()
  message: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveFilesFileDto)
  files: SaveFilesFileDto[]
}

class SubmitToCorrectionDto {
  @IsString()
  branch: string
}

@Controller('translation')
export class TranslationController {
  constructor(
    private readonly routeService: RoutesService,
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly githubHttpService: GithubHttpService,
    private readonly progressionService: ProgressionService,
    private readonly repositoryContext: RepositoryContext,
    private readonly pullRequestsService: PullRequestsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  @Get('/list')
  async getAllTranslations(@Req() req: Request) {
    const { owner: repositoryOwner, name: repositoryName, mainBranch } = this.repositoryContext

    const [pullRequestsOpen, pullRequestsClosed] = await Promise.all([
      this.githubHttpService.cachedGet<unknown[]>(
        this.routeService.GITHUB_ROUTES.LIST_PULL_REQUESTS(repositoryOwner, repositoryName) +
          `?base=${mainBranch}&state=open&sort=updated&direction=desc&per_page=100`,
        { authorization: req.headers.authorization }
      ),
      this.githubHttpService.cachedGet<unknown[]>(
        this.routeService.GITHUB_ROUTES.LIST_PULL_REQUESTS(repositoryOwner, repositoryName) +
          `?base=${mainBranch}&state=closed&sort=created&direction=desc&per_page=50`,
        { authorization: req.headers.authorization }
      )
    ])

    return [...pullRequestsOpen, ...pullRequestsClosed]
  }

  @Post('/')
  async createTranslation(@Req() req: Request, @Body() body: CreateTranslationDto) {
    const { owner: repositoryOwner, name: repositoryName, mainBranch } = this.repositoryContext
    const translationLabel = this.configService.getOrThrow('TRANSLATION_LABEL_NAME', { infer: true })
    const wipLabel = this.configService.getOrThrow('TRANSLATION_WIP_LABEL_NAME', { infer: true })

    const lastMasterCommit = await this.githubHttpService.request<{ sha: string }>(
      this.routeService.GITHUB_ROUTES.COMMITS(repositoryOwner, repositoryName, mainBranch),
      { authorization: req.headers.authorization, operation: 'retrieve last commit' }
    )

    const head = body.name
      .replace(/[^a-zA-Z0-9_\s]/g, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()

    const ref = `refs/heads/${head}`

    await this.githubHttpService.request(this.routeService.GITHUB_ROUTES.CREATE_REF(repositoryOwner, repositoryName), {
      method: 'POST',
      authorization: req.headers.authorization,
      body: { ref, sha: lastMasterCommit.sha },
      operation: 'create branch'
    })

    const branchIdentifierContents = await this.githubHttpService.request<{ sha: string }>(
      this.routeService.GITHUB_ROUTES.READ_FILE(repositoryOwner, repositoryName, '.branch-identifier') + `?ref=${head}`,
      { authorization: req.headers.authorization, operation: 'read branch identifier' }
    )

    // Edit readme.md to add the branch name at the end
    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.EDIT_FILE(repositoryOwner, repositoryName, '.branch-identifier'),
      {
        method: 'PUT',
        authorization: req.headers.authorization,
        body: {
          message: `Branch identifier for ${head}`,
          content: Buffer.from(head).toString('base64'),
          branch: head,
          sha: branchIdentifierContents.sha
        },
        operation: 'edit branch identifier'
      }
    )

    const pullRequest = await this.githubHttpService.request<{ number: number }>(
      this.routeService.GITHUB_ROUTES.CREATE_PULL_REQUEST(repositoryOwner, repositoryName),
      {
        method: 'POST',
        authorization: req.headers.authorization,
        body: {
          title: body.name,
          head,
          base: mainBranch,
          body: ReviewSignoffs.initialBody()
        },
        operation: 'create PR'
      }
    )

    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.ADD_LABEL(repositoryOwner, repositoryName, pullRequest.number),
      {
        method: 'POST',
        authorization: req.headers.authorization,
        body: [translationLabel, wipLabel],
        operation: 'add label to PR'
      }
    )

    return pullRequest
  }

  @Get('/files')
  public async getFiles(@Req() req: Request, @Query('branch') branch: string) {
    // const cachedFiles = await this.cacheManager.get(CACHE_KEYS.FILES(branch))
    // if (cachedFiles) {
    //   Logger.log(`Returning cached files for branch ${branch}`)
    //   return cachedFiles
    // }

    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const files = await Promise.all(
      translationFiles.all().map(async ({ original, translated, name, category, pathsInGameFolder }) => {
        const originalFile = await this.githubHttpService.request<{ download_url: string }>(
          this.routeService.GITHUB_ROUTES.READ_FILE(repositoryOwner, repositoryName, original) + `?ref=${branch}`,
          { authorization: req.headers.authorization, operation: 'read original file' }
        )

        const translatedFile = await this.githubHttpService.request<{ download_url: string }>(
          this.routeService.GITHUB_ROUTES.READ_FILE(repositoryOwner, repositoryName, translated) + `?ref=${branch}`,
          { authorization: req.headers.authorization, operation: 'read translated file' }
        )

        return {
          category,
          name,
          pathsInGameFolder,
          translatedPath: translated,
          originalPath: original,
          original: originalFile.download_url,
          translated: translatedFile.download_url
        }
      })
    )

    await this.cacheManager.set(CACHE_KEYS.FILES(branch), files, 1000 * 60 * 60)

    return files
  }

  @Get('/files-at-branch-creation')
  public async getFilesAtBranchCreation(@Req() req: Request, @Query('branch') branch: string) {
    const { owner: repositoryOwner, name: repositoryName, mainBranch } = this.repositoryContext

    const commitComparisonData = await this.githubHttpService.request<{ merge_base_commit: { sha: string } }>(
      this.routeService.GITHUB_ROUTES.COMPARE_COMMITS(repositoryOwner, repositoryName, mainBranch, branch),
      { authorization: req.headers.authorization, operation: 'compare commits' }
    )

    const files = await Promise.all(
      translationFiles.all().map(async ({ original, translated, name, category, pathsInGameFolder }) => {
        const originalFile = await this.githubHttpService.request<{ download_url: string }>(
          this.routeService.GITHUB_ROUTES.READ_FILE(repositoryOwner, repositoryName, original) +
            `?ref=${commitComparisonData.merge_base_commit.sha}`,
          { authorization: req.headers.authorization, operation: 'read original file' }
        )

        const translatedFile = await this.githubHttpService.request<{ download_url: string }>(
          this.routeService.GITHUB_ROUTES.READ_FILE(repositoryOwner, repositoryName, translated) +
            `?ref=${commitComparisonData.merge_base_commit.sha}`,
          { authorization: req.headers.authorization, operation: 'read translated file' }
        )

        return {
          category,
          name,
          pathsInGameFolder,
          translatedPath: translated,
          originalPath: original,
          original: originalFile.download_url,
          translated: translatedFile.download_url
        }
      })
    )

    return files
  }

  @Post('/files')
  public async saveFiles(@Req() req: Request, @Body() body: SaveFilesBodyDto) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const refData = await this.githubHttpService.request<{ object: { sha: string } }>(
      this.routeService.GITHUB_ROUTES.GET_BRANCH(repositoryOwner, repositoryName, body.branch),
      { authorization: req.headers.authorization, operation: 'get ref' }
    )
    const commitSha = refData.object.sha

    const commitData = await this.githubHttpService.request<{ tree: { sha: string } }>(
      this.routeService.GITHUB_ROUTES.TREE_SHA(repositoryOwner, repositoryName, commitSha),
      { authorization: req.headers.authorization, operation: 'get tree sha' }
    )
    const baseTreeSha = commitData.tree.sha

    const blobsPromises = body.files.map(async (file) => {
      const blobData = await this.githubHttpService.request<{ sha: string }>(
        this.routeService.GITHUB_ROUTES.CREATE_BLOB(repositoryOwner, repositoryName),
        {
          method: 'POST',
          authorization: req.headers.authorization,
          body: { content: file.content, encoding: 'utf-8' },
          operation: 'create blob'
        }
      )

      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha
      }
    })

    const blobs = await Promise.all(blobsPromises)

    const newTreeData = await this.githubHttpService.request<{ sha: string }>(
      this.routeService.GITHUB_ROUTES.CREATE_TREE(repositoryOwner, repositoryName),
      {
        method: 'POST',
        authorization: req.headers.authorization,
        body: { base_tree: baseTreeSha, tree: blobs },
        operation: 'create tree'
      }
    )

    const newCommitData = await this.githubHttpService.request<{ sha: string }>(
      this.routeService.GITHUB_ROUTES.CREATE_COMMIT(repositoryOwner, repositoryName),
      {
        method: 'POST',
        authorization: req.headers.authorization,
        body: { message: body.message, tree: newTreeData.sha, parents: [commitSha] },
        operation: 'create commit'
      }
    )

    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.UPDATE_BRANCH_HEAD(repositoryOwner, repositoryName, body.branch),
      {
        method: 'PATCH',
        authorization: req.headers.authorization,
        body: { sha: newCommitData.sha },
        operation: 'update branch head'
      }
    )

    await this.cacheManager.del(CACHE_KEYS.FILES(body.branch))

    return { success: true }
  }

  @Post('/submit-to-review')
  async review(@Req() req: Request, @Body() body: SubmitToCorrectionDto) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext
    const wipLabel = this.configService.getOrThrow('TRANSLATION_WIP_LABEL_NAME', { infer: true })

    const pullRequest = await this.pullRequestsService.forBranch(body.branch, {
      authorization: req.headers.authorization
    })
    const pullRequestNumber = pullRequest.number

    const hasWipLabel = pullRequest.labels.some((label) => label.name === wipLabel)

    if (hasWipLabel) {
      await this.githubHttpService.request(
        this.routeService.GITHUB_ROUTES.DELETE_LABEL(repositoryOwner, repositoryName, pullRequestNumber, wipLabel),
        { method: 'DELETE', authorization: req.headers.authorization, operation: 'delete label from PR' }
      )
    }

    const pullRequestBody = ReviewSignoffs.clearChangeRequests(pullRequest.body)

    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.EDIT_PULL_REQUEST(repositoryOwner, repositoryName, pullRequestNumber),
      {
        method: 'PATCH',
        authorization: req.headers.authorization,
        body: { body: pullRequestBody, state: 'open' },
        operation: 'edit pull request'
      }
    )

    return { success: true }
  }

  @UseGuards(GithubAuthGuard)
  @Post('/approve')
  async approveTranslation(@Req() req: AuthedRequest, @Body() body: { branch: string }) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const pullRequest = await this.pullRequestsService.forBranch(body.branch, {
      authorization: req.headers.authorization
    })

    const pullRequestBody = ReviewSignoffs.approve(pullRequest.body, req.user.login)

    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.EDIT_PULL_REQUEST(repositoryOwner, repositoryName, pullRequest.number),
      {
        method: 'PATCH',
        authorization: req.headers.authorization,
        body: { body: pullRequestBody, state: 'open' },
        operation: 'edit pull request'
      }
    )

    return { success: true }
  }

  @UseGuards(GithubAuthGuard)
  @Post('/mark-as-reviewed')
  async markAsReviewed(@Req() req: AuthedRequest, @Body() body: { branch: string }) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const pullRequest = await this.pullRequestsService.forBranch(body.branch, {
      authorization: req.headers.authorization
    })

    const pullRequestBody = ReviewSignoffs.requestChanges(pullRequest.body, req.user.login)

    await this.githubHttpService.request(
      this.routeService.GITHUB_ROUTES.EDIT_PULL_REQUEST(repositoryOwner, repositoryName, pullRequest.number),
      {
        method: 'PATCH',
        authorization: req.headers.authorization,
        body: { body: pullRequestBody, state: 'open' },
        operation: 'edit pull request'
      }
    )

    return { success: true }
  }

  @Get('/comments')
  async getComments(@Req() req: Request, @Query('branch') branch: string) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const pullRequest = await this.pullRequestsService.forBranch(branch, { authorization: req.headers.authorization })
    const pullRequestNumber = pullRequest.number

    const cachedComments = await this.cacheManager.get(CACHE_KEYS.COMMENTS(pullRequestNumber))
    Logger.log(`Cached comments for pull request ${pullRequestNumber}:`, !!cachedComments)
    if (cachedComments) {
      Logger.log(`Returning cached comments for pull request ${pullRequestNumber}`)
      return cachedComments
    }

    let comments: { original_line?: number }[] = []
    const maxIter = 5

    // Stays on `fetch` (not `request`): pagination needs the raw `Link` response header to decide
    // whether another page exists, which `request` (body-only) does not surface.
    for (let i = 0; i < maxIter; i++) {
      const commentsResponse = await this.githubHttpService.fetch(
        this.routeService.GITHUB_ROUTES.LIST_COMMENTS(repositoryOwner, repositoryName, pullRequestNumber) +
          '&page=' +
          (i + 1),
        { authorization: req.headers.authorization }
      )

      if (!commentsResponse.ok)
        throw new Error(`Failed to fetch comments ${commentsResponse.status} ${commentsResponse.statusText}`)
      comments = comments.concat(
        ((await commentsResponse.json()) as { original_line?: number }[]).filter(
          (comment) => comment.original_line != null
        )
      )

      if (!commentsResponse.headers.get('Link')) break
    }

    const mappedComments = comments.map((comment) => ({
      ...comment,
      line: (comment as { original_line?: number }).original_line
    }))

    await this.cacheManager.set(CACHE_KEYS.COMMENTS(pullRequestNumber), mappedComments, 1000 * 60 * 60)
    Logger.log(`Fetched ${comments.length} comments for pull request ${pullRequestNumber}`)

    return mappedComments
  }

  @Post('/comment')
  async postComment(
    @Req() req: Request,
    @Body() body: { branch: string; body: string; line: number; filePath: string; inReplyTo?: number }
  ) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const pullRequest = await this.pullRequestsService.forBranch(body.branch, {
      authorization: req.headers.authorization
    })
    const pullRequestNumber = pullRequest.number

    const lastCommit = await this.githubHttpService.request<{ sha: string }>(
      this.routeService.GITHUB_ROUTES.COMMITS(repositoryOwner, repositoryName, body.branch),
      { authorization: req.headers.authorization, operation: 'retrieve last commit' }
    )

    if (body.inReplyTo) {
      await this.githubHttpService.request(
        this.routeService.GITHUB_ROUTES.ADD_COMMENT(repositoryOwner, repositoryName, pullRequestNumber),
        {
          method: 'POST',
          authorization: req.headers.authorization,
          body: {
            body: body.body,
            commit_id: lastCommit.sha,
            path: body.filePath,
            side: 'RIGHT',
            line: body.line,
            subject_type: 'line',
            in_reply_to: body.inReplyTo
          },
          operation: 'post comment'
        }
      )
    } else {
      await this.githubHttpService.request(
        this.routeService.GITHUB_ROUTES.REVIEW_PULL_REQUEST(repositoryOwner, repositoryName, pullRequestNumber),
        {
          method: 'POST',
          authorization: req.headers.authorization,
          body: {
            event: 'COMMENT',
            body: '',
            commit_id: lastCommit.sha,
            comments: [
              {
                path: body.filePath,
                body: body.body,
                line: body.line,
                side: 'RIGHT'
              }
            ]
          },
          operation: 'post comment'
        }
      )
    }

    await this.cacheManager.del(CACHE_KEYS.COMMENTS(pullRequestNumber))

    return { success: true }
  }

  @Delete('/comment')
  async deleteComment(
    @Req() req: Request,
    @Query('commentId') commentId: string,
    @Query('pullRequestNumber') pullRequestNumber: string
  ) {
    const { owner: repositoryOwner, name: repositoryName } = this.repositoryContext

    const pullRequestNumberInt = parseInt(pullRequestNumber, 10)
    if (isNaN(pullRequestNumberInt)) {
      throw new Error(`Invalid pull request number: ${pullRequestNumber}`)
    }

    await this.githubHttpService.request(
      `${this.routeService.GITHUB_ROUTES.DELETE_COMMENT(repositoryOwner, repositoryName, parseInt(commentId, 10))}`,
      { method: 'DELETE', authorization: req.headers.authorization, operation: 'delete comment' }
    )

    await this.cacheManager.del(CACHE_KEYS.COMMENTS(pullRequestNumberInt))

    return { success: true }
  }

  @Get('/progression')
  getProgression() {
    return this.progressionService.getProgression()
  }
}
