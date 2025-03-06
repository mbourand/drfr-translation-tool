import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from 'src/env'
import { spawn, ChildProcess } from 'child_process'

@Injectable()
export class SmeeService implements OnModuleInit, OnModuleDestroy {
  private smeeProcess: ChildProcess | null = null

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {}

  onModuleInit() {
    const isSmeeEnabled = this.config.get('ENABLE_SMEE', { infer: true })
    if (!isSmeeEnabled) {
      Logger.log('Smee is disabled. Skipping Smee setup.')
      return
    }

    const smeeSourceUrl = this.config.get('SMEE_GITHUB_WEBHOOK_SOURCE_URL', { infer: true })
    const smeeTargetUrl = this.config.get('SMEE_GITHUB_WEBHOOK_TARGET_URL', { infer: true })

    if (!smeeSourceUrl || !smeeTargetUrl) {
      Logger.warn('Smee source or target URL is not provided. Skipping Smee setup.')
      return
    }

    Logger.log(`🔗 Running Smee : ${smeeSourceUrl} → ${smeeTargetUrl}`)
    this.smeeProcess = spawn('smee', ['--url', smeeSourceUrl, '--target', smeeTargetUrl], {
      stdio: 'inherit',
      shell: true
    })

    this.smeeProcess.on('error', (err) => Logger.error('❌ An error occured while running Smee :', err))

    this.smeeProcess.on('exit', (code) => Logger.log(`🔄 Smee exited with error code ${code}`))
  }

  onModuleDestroy() {
    if (this.smeeProcess) {
      Logger.log('🛑 Closing Smee...')
      this.smeeProcess.kill()
    }
  }
}
