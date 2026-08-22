# VidForge

A Windows desktop video editor, Multi-track timeline, FFmpeg-powered import, edit, and export. Ships as a single `.exe`.
See [VIDEO_EDITOR_TRD.md](VIDEO_EDITOR_TRD.md) for the full technical specification.

## Status
Phase 1 complete — project create/open/save with media import (probe + thumbnail).
Phase 2 (timeline & playback) is next.

## Requirements

- Node.js 20+ (developed against 24)
- npm 10+
- Windows 10 (1909+) or Windows 11 to run the packaged `.exe`

## Quick start

```powershell
npm install
npm run dev          # launch in dev mode with HMR
npm run package      # build NSIS installer + portable .exe into dist/
```

### Dev mode caveat — VS Code integrated terminal

VS Code's extension host sets `ELECTRON_RUN_AS_NODE=1` in the environment and child shells inherit it. With that env var set, `npm run dev` fails because Electron starts as plain Node.js and `require('electron')` no longer returns the API. Before running dev mode from a VS Code terminal:

```powershell
Remove-Item env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item env:\VSCODE_ESM_ENTRYPOINT  -ErrorAction SilentlyContinue
npm run dev
```

External terminals (Windows Terminal, PowerShell, cmd) are unaffected. The packaged `.exe` is unaffected — this only impacts launching Electron from a VS Code shell.

### First package build — winCodeSign cache workaround

The first `npm run package` may loop forever on `Cannot create symbolic link ... darwin/10.12/lib/libcrypto.dylib`. This is electron-builder's `winCodeSign` cache failing to extract macOS symlinks on Windows. Either enable Windows Developer Mode (Settings → Privacy & security → For developers) for a permanent fix, or run this one-time workaround in Git Bash:

```bash
CACHE_DIR="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
SRC=$(ls -td "$CACHE_DIR"/[0-9]*/ | head -1)
mv "$SRC" "$CACHE_DIR/winCodeSign-2.6.0"
rm -rf "$CACHE_DIR"/[0-9]*
```

## FFmpeg

The packaging pipeline expects `resources/ffmpeg/ffmpeg.exe` and `resources/ffmpeg/ffprobe.exe`. These are wired up in Phase 1. Download a static GPL build from <https://www.gyan.dev/ffmpeg/builds/> and drop the two binaries into `resources/ffmpeg/`.

## License

FFmpeg is bundled under the GPL. This project is therefore GPL-3.0.

## Code signing

Builds are unsigned in v1. Windows SmartScreen may warn on first install — click "More info" → "Run anyway".
