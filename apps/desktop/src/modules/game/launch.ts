import { invoke } from '@tauri-apps/api/core'
import { RUST_COMMANDS } from '../commands/commands'
import { exists, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { path } from '@tauri-apps/api'

// Snippet from patcher repo
export const ORIGINAL_FILE_EXT = '.original'
export const PATCHED_FILE_EXT = '.patched'
const ON_THE_FLY_STRINGS_FILE_NAME = '.current_strings.txt'

// Debug saves shipped in the translation git repo, copied into the user's saves folder under the
// `debug_save` name on every launch so testers always have an up-to-date set of checkpoint saves.
const DEBUG_SAVES_PATH_IN_GIT_FOLDER = ['script', 'DebugMode', 'debug_save']
const DEBUG_SAVES_DEST_FOLDER_NAME = 'debug_save'

export type PatchGameTranslationFile = {
  pathInGameFolder: string
  content: string
  pathInGitFolder: string
}

type CopyDebugSavesParams = {
  gitFolder: string
  savesFolder: string
}

export const copyDebugSaves = async ({ gitFolder, savesFolder }: CopyDebugSavesParams) => {
  const source = await path.join(gitFolder, ...DEBUG_SAVES_PATH_IN_GIT_FOLDER)
  const destination = await path.join(savesFolder, DEBUG_SAVES_DEST_FOLDER_NAME)
  // Mirror, not overlay: the dedicated `debug_save` subfolder is cleared then re-copied so it always
  // matches the synced branch exactly (no stale saves from upstream removals or another branch).
  await invoke(RUST_COMMANDS.MIRROR_DIR, { source, destination })
}

type PatchAndLaunchGameParams = {
  gameFolder: string
  gitFolder: string
  savesFolder: string
  files: PatchGameTranslationFile[]
}

export const patchAndLaunchGame = async ({
  files,
  gameFolder,
  gitFolder,
  savesFolder
}: PatchAndLaunchGameParams) => {
  await copyDebugSaves({ gitFolder, savesFolder })

  for (const file of files) {
    const absoluteFilePathInGameFolder = await path.join(gameFolder, file.pathInGameFolder ?? '')
    const originalFilePathInGameFolder = absoluteFilePathInGameFolder + ORIGINAL_FILE_EXT
    if (!file.pathInGameFolder.endsWith('.win')) {
      if (await exists(absoluteFilePathInGameFolder)) {
        await rename(absoluteFilePathInGameFolder, originalFilePathInGameFolder)
      }
      await writeTextFile(absoluteFilePathInGameFolder, file.content)
    } else {
      const outputFilePath = absoluteFilePathInGameFolder + PATCHED_FILE_EXT
      const absoluteFilePathInGitFolder = await path.join(gitFolder, file.pathInGitFolder)
      const chapterDirInGitFolder = await path.dirname(absoluteFilePathInGitFolder)
      const onTheFlyStringsFilePath = await path.join(chapterDirInGitFolder, ON_THE_FLY_STRINGS_FILE_NAME)

      await writeTextFile(onTheFlyStringsFilePath, file.content)

      if (!(await exists(originalFilePathInGameFolder))) {
        await rename(absoluteFilePathInGameFolder, originalFilePathInGameFolder)
      }

      const matches = absoluteFilePathInGitFolder.match(/chapitre-(\d+)/)
      if (!matches) {
        throw new Error(`Chapter could not be determined from file path: ${file.pathInGitFolder}`)
      }

      await invoke(RUST_COMMANDS.IMPORT_STRINGS, {
        sourceDataWinPath: originalFilePathInGameFolder,
        outputDataWinPath: outputFilePath,
        gitChapterFolderPath: chapterDirInGitFolder,
        gitRootFolderPath: gitFolder,
        chapter: parseInt(matches[1], 10)
      })

      await rename(outputFilePath, absoluteFilePathInGameFolder)
    }
  }

  await invoke(RUST_COMMANDS.RUN_GAME_EXECUTABLE, { gameFolderPath: gameFolder })
}
