# Linux support targets the Steam/Proton Windows build, launched via steam://

Linux translators run Deltarune as the Windows build through Steam Proton, not a native Linux build, so on Linux we treat the Game folder as the identical Windows layout (same `data.win`, same `chapterN_windows` folders) and reuse the existing patch pipeline and game paths unchanged. Because a Windows executable can't be spawned on Linux, the tool launches the game by opening `steam://rungameid/1671210` (hard-coded Deltarune app id) instead of executing the binary, and drives the native self-contained Linux `UndertaleModCli` for patching.

## Considered Options

- **Native Linux Deltarune build** — rejected: it uses a different data layout (`assets/game.unx`), which would fork the patch pipeline and require per-OS game paths from the server.
- **`steam -applaunch <id>` or direct Proton invocation** — rejected in favour of the `steam://` URL handler, which doesn't require `steam` on `PATH` and lets Steam set up the Proton prefix/runtime itself.

## Consequences

- The tool assumes Deltarune is installed through Steam with a Proton compatibility tool configured.
- On Linux the translator must select the saves folder inside the Proton prefix (e.g. `~/.local/share/Steam/steamapps/compatdata/1671210/pfx/...`); the UI shows Linux-specific guidance for this.
- OS-specific behaviour (launch method, executable names, the UTMT executable bit) is gated by target OS; the Windows path is unchanged.
