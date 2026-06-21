// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::io::{Cursor, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

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

/// Pure decision: the UTMT CLI binary path inside the user-selected folder. The native Linux build
/// has no extension; Windows (and macOS, left unchanged) use `UndertaleModCli.exe`.
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
    source_data_win_path: &str,
    utmt_cli_folder_path: &str,
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

#[tauri::command]
async fn pull_changes_from_git(git_folder: &str) -> Result<(), String> {
    // Switch to master if not on this branch, then git pull, report error if pull or switch failed
    let output = Command::new("git")
        .args(["checkout", "master"])
        .current_dir(git_folder)
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    println!("Git checkout output: {}", String::from_utf8_lossy(&output.stdout));

    if !output.status.success() {
        return Err(format!("git checkout failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let output = Command::new("git")
        .args(["pull", "origin", "master"])
        .current_dir(git_folder)
        .output()
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    println!("Git pull output: {}", String::from_utf8_lossy(&output.stdout));

    if !output.status.success() {
        return Err(format!("git pull failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
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
            is_dev,
            pull_changes_from_git,
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
}
