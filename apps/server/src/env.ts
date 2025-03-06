import { Transform } from 'class-transformer'
import { IsString } from 'class-validator'

const isTrue = ({ value }: { value: string }) => value === 'true'

export class EnvironmentVariables {
  // Github
  @IsString() GITHUB_BASE_URL: string
  @IsString() GITHUB_APP_CLIENT_ID: string
  @IsString() GITHUB_APP_CLIENT_SECRET: string
  @IsString() GITHUB_APP_WEBHOOK_SECRET: string

  // Smee for local development
  @IsString() @Transform(isTrue) ENABLE_SMEE: boolean
  @IsString() SMEE_GITHUB_WEBHOOK_SOURCE_URL: string
  @IsString() SMEE_GITHUB_WEBHOOK_TARGET_URL: string
  @IsString() SMEE_GITHUB_AUTH_CALLBACK_SOURCE_URL: string
  @IsString() SMEE_GITHUB_AUTH_CALLBACK_TARGET_URL: string
}
