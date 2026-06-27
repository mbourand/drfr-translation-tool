// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::path::BaseDirectory;
use tauri::Manager;

/// Sub-path of the app's resource directory holding the bundled, pinned `UndertaleModCli`
/// (shipped per-platform by CI — see `.github/workflows/build.yml`). Users no longer install or
/// pick UTMT; the importer resolves the CLI from here instead of a user-selected folder.
const BUNDLED_UTMT_RESOURCE_DIR: &str = "utmt";

/// What "launch the game" means on the host OS. Windows (and macOS, left unchanged) spawn the
/// Windows executable directly; Linux runs that same Windows executable through Wine (no native
/// Linux build exists).
#[derive(Debug, PartialEq, Eq)]
enum LaunchAction {
    RunExecutable(String),
    RunWithWine(String),
}

/// Pure decision: map the host OS + Game folder to a launch action. Kept free of side effects so
/// the per-OS branching is unit-testable on any host (the OS is passed in, not read from `env`).
fn launch_action(os: &str, game_folder_path: &str) -> LaunchAction {
    let executable_path = format!("{}/DELTARUNE.exe", game_folder_path);
    match os {
        "linux" => LaunchAction::RunWithWine(executable_path),
        _ => LaunchAction::RunExecutable(executable_path),
    }
}

/// Pure decision: the UTMT CLI binary path inside the bundled resource folder. The native Linux
/// build has no extension; Windows (and macOS, left unchanged) use `UndertaleModCli.exe`.
fn utmt_program_path(os: &str, utmt_cli_folder_path: &str) -> String {
    match os {
        "linux" => format!("{}/UndertaleModCli", utmt_cli_folder_path),
        _ => format!("{}/UndertaleModCli.exe", utmt_cli_folder_path),
    }
}

/// Pure decision: whether the UTMT CLI's executable bit must be ensured before spawning. Only the
/// native Linux build needs it — a CLI freshly unzipped via a file manager may not be executable,
/// which would otherwise fail with an opaque "permission denied".
fn utmt_needs_exec_bit(os: &str) -> bool {
    os == "linux"
}

/// Set mode 0755 on the UTMT CLI binary so a freshly-extracted CLI runs without a manual `chmod`.
#[cfg(unix)]
fn ensure_executable(path: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path, e))?
        .permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)
        .map_err(|e| format!("Failed to set executable bit on {}: {}", path, e))
}

/// No-op on non-Unix hosts: `utmt_needs_exec_bit` is only ever true on Linux, so this is never
/// reached on Windows — it exists solely so the crate compiles on the Windows dev host.
#[cfg(not(unix))]
fn ensure_executable(_path: &str) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn import_strings(
    app: tauri::AppHandle,
    source_data_win_path: &str,
    git_chapter_folder_path: &str,
    git_root_folder_path: &str,
    output_data_win_path: &str,
    chapter: u32,
) -> Result<(), String> {
    let importer_tout_script_path = format!(
        "{}/script/UMT/DRFR/ImporterToutTranslationTool.csx",
        git_root_folder_path
    );

    let import_script_path = format!(
        "{}/data/Code/chapter{}.csx",
        git_chapter_folder_path,
        chapter.to_string()
    );

    // Resolve the bundled UTMT CLI from the app's resource directory rather than a user-picked
    // folder. The folder is shipped with the app (CI fetches the pinned, self-contained build), so
    // there is nothing to install and no wrong build to select.
    let utmt_cli_folder_path = app
        .path()
        .resolve(BUNDLED_UTMT_RESOURCE_DIR, BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve bundled UTMT resource directory: {}", e))?;
    let utmt_cli_folder_path = utmt_cli_folder_path
        .to_str()
        .ok_or("Bundled UTMT resource directory path is not valid UTF-8")?;

    let utmt_cli_program_path = utmt_program_path(std::env::consts::OS, utmt_cli_folder_path);

    if utmt_needs_exec_bit(std::env::consts::OS) {
        ensure_executable(&utmt_cli_program_path)?;
    }

    let debug_mode_script_path = format!(
        "{}/script/DebugMode/debug_mode_chap{}.csx",
        git_root_folder_path,
        chapter.to_string()
    );

    println!(
        "Importing strings for chapter {} using scripts: {}, {} and {}",
        chapter.to_string(),
        importer_tout_script_path,
        import_script_path,
        debug_mode_script_path
    );

    if !PathBuf::from(&debug_mode_script_path).exists() {
        println!(
            "Debug mode script not found for chapter {}. Building without debug mode.",
            chapter.to_string()
        );
    }

    let mut utmt_command = Command::new(utmt_cli_program_path)
        .current_dir(git_root_folder_path)
        .args([
            "load",
            &source_data_win_path,
            "-s",
            &importer_tout_script_path,
            "-s",
            &import_script_path,
            "-s",
            &debug_mode_script_path,
            "-o",
            &output_data_win_path,
        ])
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start UndertaleModCli command: {}", e))?;

    let mut stdin = utmt_command
        .stdin
        .take()
        .ok_or("Failed to open stdin for UndertaleModCli command")?;

    let git_chapter_folder_path_owned = git_chapter_folder_path.to_owned();
    std::thread::spawn(move || {
        let _ = stdin
            .write_all((git_chapter_folder_path_owned + "\n").as_bytes())
            .map_err(|e| {
                format!(
                    "Failed to write base data directory to UndertaleModCli stdin: {}",
                    e
                )
            });
        let _ = stdin
            .flush()
            .map_err(|e| format!("Failed to flush UndertaleModCli stdin: {}", e));
    });

    utmt_command
        .wait()
        .map_err(|e| format!("Failed to wait for UndertaleModCli command: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn run_game_executable(game_folder_path: &str) -> Result<(), String> {
    // Thin shell: decide per-OS, then execute. Windows (and macOS) spawn the binary directly; Linux
    // runs the same Windows executable through Wine (see launch_action).
    let mut command = match launch_action(std::env::consts::OS, game_folder_path) {
        LaunchAction::RunExecutable(executable_path) => Command::new(executable_path),
        LaunchAction::RunWithWine(executable_path) => {
            let mut command = Command::new("wine");
            command.arg(executable_path);
            command
        }
    };

    command
        .current_dir(game_folder_path)
        .spawn()
        .map_err(|e| format!("Failed to start the game executable: {}", e))
        .map(|_| ())
}

/// Recursively copy a directory tree from `source` into `destination`, creating `destination` and
/// any intermediate directories. Existing files at the destination are overwritten. Used to seed
/// the user's saves folder with the debug saves shipped in the translation git repo.
fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::create_dir_all(destination)
        .map_err(|e| format!("Failed to create directory {}: {}", destination.display(), e))?;

    let entries = std::fs::read_dir(source)
        .map_err(|e| format!("Failed to read directory {}: {}", source.display(), e))?;

    for entry in entries {
        let entry = entry
            .map_err(|e| format!("Failed to read an entry in {}: {}", source.display(), e))?;
        let entry_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read file type for {}: {}", entry_path.display(), e))?;

        if file_type.is_dir() {
            copy_dir_recursive(&entry_path, &destination_path)?;
        } else {
            std::fs::copy(&entry_path, &destination_path).map_err(|e| {
                format!(
                    "Failed to copy {} to {}: {}",
                    entry_path.display(),
                    destination_path.display(),
                    e
                )
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
fn copy_dir(source: String, destination: String) -> Result<(), String> {
    copy_dir_recursive(Path::new(&source), Path::new(&destination))
}

/// Mirror a directory tree: make `destination` an exact copy of `source` by clearing `destination`
/// first, then recursively copying. Unlike `copy_dir_recursive` (an overlay that only adds and
/// overwrites), this removes stale destination entries that no longer exist upstream. Used for the
/// per-launch debug-save copy so the tester's `debug_save` folder always matches the synced branch
/// exactly — a save removed/renamed upstream or left over from another branch can't linger. Only the
/// dedicated `debug_save` subfolder is ever passed as `destination`, so unrelated user saves outside
/// it are never touched.
fn mirror_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    remove_dir_if_exists(destination)?;
    copy_dir_recursive(source, destination)
}

#[tauri::command]
fn mirror_dir(source: String, destination: String) -> Result<(), String> {
    mirror_dir_recursive(Path::new(&source), Path::new(&destination))
}

#[tauri::command]
fn unzip_file(path: String, target_dir: String) -> Result<(), String> {
    let archive = std::fs::read(&path)
        .map_err(|e| format!("Error reading file {}: {}", path, e.to_string()))?;
    let target_dir_path = PathBuf::from(&target_dir);

    zip_extract::extract(Cursor::new(&archive), &target_dir_path, false)
        .map_err(|e| format!("Error extracting file {}: {}", path, e.to_string()))?;

    Ok(())
}

/// App-local subdirectory holding per-branch synced patcher content — one directory per branch
/// (e.g. `patcher/master/`), each a stripped copy of that branch's repo zip. Replaces the
/// user-picked git clone: the app manages this location, the user never sees or picks it.
const PATCHER_SUBDIR: &str = "patcher";

/// Pure decision: the app-managed local directory for a branch's synced content,
/// `<app_local_data_dir>/patcher/<branch>`. Kept side-effect free so the mapping is unit-testable.
fn branch_local_path(app_local_data_dir: &Path, branch: &str) -> PathBuf {
    app_local_data_dir.join(PATCHER_SUBDIR).join(branch)
}

/// Pure decision: the sidecar file holding a branch's stored head-SHA, `patcher/<branch>.sha`. Kept
/// beside the branch dir (not inside it) so the atomic directory swap never touches it. Side-effect
/// free so the mapping is unit-testable.
fn head_sha_path(patcher_dir: &Path, branch: &str) -> PathBuf {
    patcher_dir.join(format!("{}.sha", branch))
}

/// Pure decision: whether a branch must be re-downloaded given its stored head-SHA and the remote
/// head-SHA just fetched. Download when nothing is stored yet (first run) or the two differ (the
/// branch moved); skip when they are equal. Kept side-effect free so it is unit-testable.
fn should_download(stored_sha: Option<&str>, remote_sha: &str) -> bool {
    stored_sha != Some(remote_sha)
}

/// Read a branch's stored head-SHA, or `None` if it has never synced (or the file is unreadable or
/// blank). A missing/blank SHA reads as "stale" through `should_download`, so the next launch syncs.
fn read_stored_sha(patcher_dir: &Path, branch: &str) -> Option<String> {
    std::fs::read_to_string(head_sha_path(patcher_dir, branch))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Persist a branch's head-SHA, writing to a temp file then renaming so a crash mid-write can never
/// leave a half-written SHA. Called only after a fully successful swap (see `sync_zip_into_branch`).
fn write_stored_sha(patcher_dir: &Path, branch: &str, sha: &str) -> Result<(), String> {
    let tmp_path = patcher_dir.join(format!(".{}.sha.incoming", branch));
    std::fs::write(&tmp_path, sha.as_bytes())
        .map_err(|e| format!("Failed to write head SHA for {}: {}", branch, e))?;
    std::fs::rename(&tmp_path, head_sha_path(patcher_dir, branch))
        .map_err(|e| format!("Failed to persist head SHA for {}: {}", branch, e))
}

/// Extract a GitHub-style repo zip into `target_dir`, stripping the single top-level
/// `owner-repo-<sha>/` folder GitHub wraps every archive in, so the extracted tree's root is the
/// repo root (`script/`, `chapitre-N/`, …). Thin wrapper over `zip_extract` with `strip_toplevel`.
fn extract_repo_zip(archive: &[u8], target_dir: &Path) -> Result<(), String> {
    zip_extract::extract(Cursor::new(archive), target_dir, true)
        .map_err(|e| format!("Error extracting repo zip into {}: {}", target_dir.display(), e))
}

/// A freshly-extracted branch tree must have the repo root at the top: `script/` is always present
/// (it holds the UTMT importer scripts the launcher runs). Used to reject a partial or garbled
/// extraction before it is swapped into the live location.
fn extracted_tree_is_valid(dir: &Path) -> bool {
    dir.join("script").is_dir()
}

/// Remove a directory and its contents if it exists; a no-op if it does not. Used to clear stale
/// temp directories before an extraction and to drop the previous copy after a successful swap.
fn remove_dir_if_exists(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)
            .map_err(|e| format!("Failed to remove {}: {}", dir.display(), e))?;
    }
    Ok(())
}

/// Extract a branch zip into `patcher/<branch>/`, replacing any previous copy via an atomic-ish swap,
/// then persist the branch's head-SHA. Extraction goes to a sibling temp dir first and is fully
/// validated before the live folder is touched, and the SHA is recorded **only after** the swap fully
/// succeeds — so a failed or interrupted sync can never corrupt a working install, and leaves the
/// stored SHA unchanged so the next launch re-checks and retries. Returns the synced branch folder.
///
/// Takes `patcher_dir` and the archive bytes explicitly (rather than reading the app handle / disk)
/// so the swap-and-persist logic is unit-testable against a real temp dir.
fn sync_zip_into_branch(
    patcher_dir: &Path,
    branch: &str,
    archive: &[u8],
    head_sha: &str,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(patcher_dir).map_err(|e| {
        format!(
            "Failed to create patcher directory {}: {}",
            patcher_dir.display(),
            e
        )
    })?;

    let destination = patcher_dir.join(branch);

    // Extract into a sibling temp dir first; the live branch folder below is only ever touched by
    // fast renames. A failure during extract/validate leaves `destination` fully intact.
    let temp_new = patcher_dir.join(format!(".{}.incoming", branch));
    let temp_old = patcher_dir.join(format!(".{}.previous", branch));

    // Self-heal a swap that was interrupted last time: if the live folder is gone but the previous
    // good copy was moved aside and never restored, put it back before we clear any temp dirs —
    // otherwise the cleanup below would delete the only surviving copy.
    if !destination.exists() && temp_old.exists() {
        std::fs::rename(&temp_old, &destination)
            .map_err(|e| format!("Failed to restore previous {} copy: {}", branch, e))?;
    }

    remove_dir_if_exists(&temp_new)?;
    remove_dir_if_exists(&temp_old)?;

    extract_repo_zip(archive, &temp_new)?;

    if !extracted_tree_is_valid(&temp_new) {
        remove_dir_if_exists(&temp_new)?;
        return Err(format!(
            "Downloaded {} content is missing the expected repo root (no script/ directory); refusing to swap",
            branch
        ));
    }

    // Swap: move the current good copy aside, move the new copy in, then drop the old. Extraction
    // already fully succeeded, so this is only fast renames on the same filesystem.
    if destination.exists() {
        std::fs::rename(&destination, &temp_old)
            .map_err(|e| format!("Failed to move previous {} copy aside: {}", branch, e))?;
    }
    if let Err(e) = std::fs::rename(&temp_new, &destination) {
        // Put the previous copy back so a failed swap still leaves a working install.
        let _ = std::fs::rename(&temp_old, &destination);
        return Err(format!("Failed to swap in new {} copy: {}", branch, e));
    }
    remove_dir_if_exists(&temp_old)?;

    // Persist the head-SHA only now, after a fully successful swap, so any earlier failure leaves the
    // previously stored SHA untouched and the next launch's check still sees the branch as stale.
    write_stored_sha(patcher_dir, branch, head_sha)?;

    Ok(destination)
}

/// Download-side entry point: read the downloaded zip and hand it to `sync_zip_into_branch`, which
/// swaps it into the app-managed `patcher/<branch>/` and records `head_sha`. Returns the synced
/// branch folder (the launcher's git root).
#[tauri::command]
fn sync_branch_from_zip(
    app: tauri::AppHandle,
    branch: String,
    zip_path: String,
    head_sha: String,
) -> Result<String, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))?;
    let patcher_dir = app_local_data_dir.join(PATCHER_SUBDIR);

    let archive = std::fs::read(&zip_path)
        .map_err(|e| format!("Error reading downloaded zip {}: {}", zip_path, e))?;

    let destination = sync_zip_into_branch(&patcher_dir, &branch, &archive, &head_sha)?;

    destination
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Synced {} path is not valid UTF-8", branch))
}

/// Cheap freshness gate used before a launch: compare the branch's stored head-SHA against the
/// `remote_sha` the caller just fetched and report whether a fresh download is needed. The actual
/// HTTP head-SHA check lives client-side (it needs the user's token); this only owns the decision.
#[tauri::command]
fn branch_needs_sync(
    app: tauri::AppHandle,
    branch: String,
    remote_sha: String,
) -> Result<bool, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))?;
    let patcher_dir = app_local_data_dir.join(PATCHER_SUBDIR);
    Ok(should_download(
        read_stored_sha(&patcher_dir, &branch).as_deref(),
        &remote_sha,
    ))
}

/// The branch's locally synced folder if one exists, else `None`. Lets the launcher fall back to a
/// last-good copy when an update check or download fails (and distinguish that from a first run with
/// no copy at all, the only case that must hard-stop).
#[tauri::command]
fn branch_local_dir(app: tauri::AppHandle, branch: String) -> Result<Option<String>, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))?;
    let destination = branch_local_path(&app_local_data_dir, &branch);
    if !destination.is_dir() {
        return Ok(None);
    }
    destination
        .to_str()
        .map(|s| Some(s.to_string()))
        .ok_or_else(|| format!("Local {} path is not valid UTF-8", branch))
}

#[tauri::command]
fn is_dev() -> bool {
    return tauri::is_dev();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_game_executable,
            import_strings,
            unzip_file,
            copy_dir,
            mirror_dir,
            is_dev,
            sync_branch_from_zip,
            branch_needs_sync,
            branch_local_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_launches_the_executable_in_the_game_folder() {
        assert_eq!(
            launch_action("windows", "C:/Games/Deltarune"),
            LaunchAction::RunExecutable("C:/Games/Deltarune/DELTARUNE.exe".to_string())
        );
    }

    #[test]
    fn linux_launches_the_executable_through_wine() {
        assert_eq!(
            launch_action("linux", "/home/user/Deltarune"),
            LaunchAction::RunWithWine("/home/user/Deltarune/DELTARUNE.exe".to_string())
        );
    }

    #[test]
    fn macos_is_left_on_the_windows_executable_launch() {
        assert_eq!(
            launch_action("macos", "/Apps/Deltarune"),
            LaunchAction::RunExecutable("/Apps/Deltarune/DELTARUNE.exe".to_string())
        );
    }

    #[test]
    fn windows_drives_the_exe_utmt_cli() {
        assert!(utmt_program_path("windows", "C:/utmt").ends_with("UndertaleModCli.exe"));
    }

    #[test]
    fn linux_drives_the_extensionless_utmt_cli() {
        let program = utmt_program_path("linux", "/opt/utmt");
        assert!(program.ends_with("UndertaleModCli"));
        assert!(!program.ends_with(".exe"));
    }

    #[test]
    fn only_linux_requests_the_utmt_executable_bit() {
        assert!(utmt_needs_exec_bit("linux"));
        assert!(!utmt_needs_exec_bit("windows"));
        assert!(!utmt_needs_exec_bit("macos"));
    }

    #[test]
    fn branch_maps_to_its_patcher_subdirectory() {
        let base = Path::new("/data/app");
        assert_eq!(
            branch_local_path(base, "master"),
            Path::new("/data/app/patcher/master")
        );
        assert_eq!(
            branch_local_path(base, "beta"),
            Path::new("/data/app/patcher/beta")
        );
    }

    /// A directory unique to this test, cleared so a leftover from a previous run never pollutes it.
    fn fresh_temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("drfr-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    /// Build a GitHub-style repo zip: every entry lives under a single `owner-repo-<sha>/` folder,
    /// exactly as `GET /repos/.../zipball/<branch>` returns.
    fn github_style_zip() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(Cursor::new(&mut buf));
            let options = zip::write::SimpleFileOptions::default();
            zip.add_directory("mbourand-deltarune-fr-abc123/", options)
                .unwrap();
            zip.start_file(
                "mbourand-deltarune-fr-abc123/script/UMT/marker.txt",
                options,
            )
            .unwrap();
            zip.write_all(b"importer").unwrap();
            zip.add_directory("mbourand-deltarune-fr-abc123/chapitre-1/", options)
                .unwrap();
            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn extracting_a_github_zip_strips_the_top_level_folder() {
        let dir = fresh_temp_dir("strip");
        extract_repo_zip(&github_style_zip(), &dir).expect("extraction should succeed");

        // The repo root is at the top — GitHub's `owner-repo-<sha>/` wrapper is gone.
        assert!(dir.join("script").is_dir(), "script/ should be at the top level");
        assert!(dir.join("script/UMT/marker.txt").is_file());
        assert!(dir.join("chapitre-1").is_dir());
        assert!(
            !dir.join("mbourand-deltarune-fr-abc123").exists(),
            "the top-level wrapper folder must be stripped"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tree_without_a_repo_root_is_rejected() {
        let dir = fresh_temp_dir("valid");
        std::fs::create_dir_all(dir.join("chapitre-1")).unwrap();
        assert!(
            !extracted_tree_is_valid(&dir),
            "a tree missing script/ is not a valid repo root"
        );

        std::fs::create_dir_all(dir.join("script")).unwrap();
        assert!(extracted_tree_is_valid(&dir));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn downloads_when_sha_is_absent_or_differs_and_skips_when_equal() {
        // First run: nothing stored yet → must download.
        assert!(should_download(None, "abc123"));
        // Branch moved: stored differs from remote → must download.
        assert!(should_download(Some("old456"), "new789"));
        // Unchanged: stored equals remote → skip the download.
        assert!(!should_download(Some("same000"), "same000"));
    }

    #[test]
    fn head_sha_lives_beside_the_branch_folder() {
        let patcher = Path::new("/data/app/patcher");
        assert_eq!(
            head_sha_path(patcher, "master"),
            Path::new("/data/app/patcher/master.sha")
        );
    }

    #[test]
    fn a_failed_sync_leaves_the_stored_sha_and_content_unchanged() {
        let patcher = fresh_temp_dir("sha-persist");

        // A first, successful sync records the branch's head-SHA alongside the swapped-in content.
        let synced = sync_zip_into_branch(&patcher, "master", &github_style_zip(), "sha-good")
            .expect("the first sync should succeed");
        assert!(synced.join("script").is_dir());
        assert_eq!(read_stored_sha(&patcher, "master").as_deref(), Some("sha-good"));

        // A later sync whose download is garbage must fail before the swap...
        let result = sync_zip_into_branch(&patcher, "master", b"not a real zip", "sha-bad");
        assert!(result.is_err(), "a corrupt archive must not swap");

        // ...leaving both the stored SHA and the live content exactly as the last good sync left them,
        // so the next launch still sees the branch as stale (sha-good ≠ new remote) and retries.
        assert_eq!(read_stored_sha(&patcher, "master").as_deref(), Some("sha-good"));
        assert!(patcher.join("master").join("script").is_dir());

        let _ = std::fs::remove_dir_all(&patcher);
    }

    #[test]
    fn mirror_makes_the_destination_match_the_source_and_drops_stale_files() {
        let base = fresh_temp_dir("mirror");
        let source = base.join("source");
        let destination = base.join("dest");

        // Source holds the "synced branch" debug saves, including a nested folder.
        std::fs::create_dir_all(source.join("nested")).unwrap();
        std::fs::write(source.join("keep.sav"), b"fresh").unwrap();
        std::fs::write(source.join("nested/inner.sav"), b"nested-fresh").unwrap();

        // Destination is a previous copy: it has a stale file absent upstream, and an outdated
        // version of a file the source also has.
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(destination.join("stale.sav"), b"left over from another branch").unwrap();
        std::fs::write(destination.join("keep.sav"), b"outdated").unwrap();

        mirror_dir_recursive(&source, &destination).expect("mirror should succeed");

        // The stale file is gone (proving mirror, not overlay)...
        assert!(
            !destination.join("stale.sav").exists(),
            "a destination file absent from the source must be removed"
        );
        // ...source files are present and overwritten, nested folders included.
        assert_eq!(std::fs::read(destination.join("keep.sav")).unwrap(), b"fresh");
        assert_eq!(
            std::fs::read(destination.join("nested/inner.sav")).unwrap(),
            b"nested-fresh"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn branches_sync_independently_and_coexist_on_disk() {
        let patcher = fresh_temp_dir("multi-branch");

        // Sync master, then beta, into the same patcher dir.
        sync_zip_into_branch(&patcher, "master", &github_style_zip(), "master-sha-1")
            .expect("master sync should succeed");
        sync_zip_into_branch(&patcher, "beta", &github_style_zip(), "beta-sha-1")
            .expect("beta sync should succeed");

        // Both copies live side by side, each with its own stored SHA.
        assert!(patcher.join("master").join("script").is_dir());
        assert!(patcher.join("beta").join("script").is_dir());
        assert_eq!(read_stored_sha(&patcher, "master").as_deref(), Some("master-sha-1"));
        assert_eq!(read_stored_sha(&patcher, "beta").as_deref(), Some("beta-sha-1"));

        // Re-syncing beta (it moved) leaves master's SHA and content untouched — flipping between
        // editing and Beta QA never re-downloads the branch that didn't change.
        sync_zip_into_branch(&patcher, "beta", &github_style_zip(), "beta-sha-2")
            .expect("second beta sync should succeed");
        assert_eq!(read_stored_sha(&patcher, "beta").as_deref(), Some("beta-sha-2"));
        assert_eq!(read_stored_sha(&patcher, "master").as_deref(), Some("master-sha-1"));
        assert!(patcher.join("master").join("script").is_dir());

        let _ = std::fs::remove_dir_all(&patcher);
    }
}
