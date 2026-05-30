# Technical Requirements Document
## Windows Desktop Video Editor

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Approved for implementation |
| Target platform | Windows 10 / 11 (x64) |
| Build target | Standalone `.exe` (installer + portable) |
| Primary language | TypeScript |
| Document audience | Claude Code (implementation agent) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [System Requirements](#3-system-requirements)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture](#5-system-architecture)
6. [Data Models](#6-data-models)
7. [IPC Contract](#7-ipc-contract)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [User Interface Specification](#10-user-interface-specification)
11. [External Dependencies](#11-external-dependencies)
12. [Build & Packaging](#12-build--packaging)
13. [Implementation Phases](#13-implementation-phases)
14. [Testing Strategy](#14-testing-strategy)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Appendices](#16-appendices)

---

## 1. Executive Summary

This document specifies a desktop video editor application for Windows that allows users to import video and audio files, arrange and trim them on a multi-track timeline, apply basic effects, and export to standard video formats. The application ships as a single installable `.exe` that runs fully offline. Architecture is based on Electron with a React/TypeScript frontend and a bundled FFmpeg binary for all media processing.

The product target is feature parity with the core editing workflow of free editors such as Shotcut or OpenShot, not parity with professional NLEs (Premiere, DaVinci Resolve, Final Cut Pro).

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Ship a clickable `.exe` that installs and launches on a stock Windows 10 / 11 machine with no external dependencies
- Support importing, trimming, cutting, arranging, and exporting common video formats (MP4, MOV, MKV, WebM, AVI)
- Provide a stable timeline with multiple video and audio tracks
- Provide responsive playback for 1080p H.264 footage on mid-range hardware
- Support GPU-accelerated encoding when available (NVENC, QuickSync, AMF)
- Produce exports that play correctly on standard players (VLC, Windows Media Player, web browsers)

### 2.2 Non-Goals
- Real-time collaborative editing
- Cloud sync or cloud rendering
- Mobile or web versions
- HDR / wide color gamut workflows
- Professional color grading (scopes, curves, LUTs are out of scope for v1)
- 3D, VR, or 360° video
- Plugin marketplaces
- Built-in stock media library

### 2.3 Success Criteria
A user can:
1. Install the app from a single `.exe` in under 60 seconds
2. Import a 1080p MP4, place two clips on a timeline, trim and cut them, and export a working MP4 in under 10 minutes of usage
3. Re-open a saved project and resume editing where they left off

---

## 3. System Requirements

### 3.1 Minimum (target machine)
- Windows 10 version 1909 or later (64-bit)
- 4-core CPU (Intel i5-8xxx / Ryzen 5 2xxx or equivalent)
- 8 GB RAM
- 2 GB free disk space for installation + working space for cache
- DirectX 11 capable GPU
- 1920 × 1080 display

### 3.2 Recommended
- Windows 11
- 8-core CPU
- 16 GB RAM
- NVIDIA GPU with NVENC (RTX 20-series or newer) or equivalent
- NVMe SSD

---

## 4. Technology Stack

### 4.1 Mandatory Choices

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Runtime shell | Electron | ≥ 30 | Mature, ships Windows `.exe` cleanly |
| UI framework | React | 18+ | Component model fits timeline UI |
| Language | TypeScript | 5+ | Type safety across the IPC boundary |
| Build tool | Vite | 5+ | Fast HMR, first-class Electron support via `electron-vite` |
| Styling | Tailwind CSS | 3+ | Speed of iteration |
| State management | Zustand | 4+ | Less boilerplate than Redux; sufficient for timeline state |
| Media engine | FFmpeg | 7.x static build | Industry standard; bundled as binary |
| Probing | ffprobe | 7.x (bundled with FFmpeg) | Metadata extraction |
| FFmpeg wrapper | `fluent-ffmpeg` | latest | Cleaner API than raw `child_process` |
| Packaging | electron-builder | latest | Produces NSIS installer + portable build |
| Testing | Vitest + Playwright | latest | Unit + end-to-end |
| Linting | ESLint + Prettier | latest | Code consistency |

### 4.2 Forbidden Choices
- **Do not use Electron Forge** — `electron-builder` is the standard for this project
- **Do not use `ffmpeg.wasm`** — too slow for desktop use
- **Do not use class components in React** — function components + hooks only
- **Do not use CommonJS in renderer** — ES modules only

### 4.3 Approved npm Packages
| Package | Purpose |
|---|---|
| `electron-vite` | Build orchestration |
| `electron-store` | User settings persistence |
| `zustand` | State management |
| `immer` | Immutable state updates |
| `fluent-ffmpeg` | FFmpeg child process wrapper |
| `wavesurfer.js` | Audio waveform rendering |
| `react-rnd` or custom | Draggable/resizable clip components |
| `react-hotkeys-hook` | Keyboard shortcut registration |
| `nanoid` | ID generation |
| `date-fns` | Time formatting |

---

## 5. System Architecture

### 5.1 Process Model

The application uses Electron's two-process model:

```
┌──────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node.js)                │
│                                                          │
│  • Window management        • File system I/O            │
│  • FFmpeg child processes   • Project file save/load     │
│  • App lifecycle            • Native menus               │
│  • Auto-updater (future)    • Settings persistence       │
└────────────────────────┬─────────────────────────────────┘
                         │ IPC (typed channels)
┌────────────────────────┴─────────────────────────────────┐
│                  RENDERER PROCESS (Chromium)             │
│                                                          │
│  • React UI                 • Timeline state (Zustand)   │
│  • Preview playback         • User input handling        │
│  • Waveform rendering       • Effect parameter UI        │
└──────────────────────────────────────────────────────────┘
```

**Rules:**
- All file system access goes through the main process
- All FFmpeg invocations go through the main process
- The renderer never directly reads from disk paths the user typed; it asks main via IPC
- IPC channels are typed via a shared `contracts.ts` file imported by both sides
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in the renderer
- `preload.ts` exposes a typed API via `contextBridge`

### 5.2 Directory Structure

```
vidforge/
├── src/
│   ├── main/
│   │   ├── index.ts                  # Electron entry point
│   │   ├── window.ts                 # BrowserWindow setup
│   │   ├── menu.ts                   # Native menu definition
│   │   ├── ipc/
│   │   │   ├── index.ts              # Registers all IPC handlers
│   │   │   ├── project.ts            # save/load/recent
│   │   │   ├── media.ts              # import/probe/thumbnail
│   │   │   └── export.ts             # render pipeline
│   │   ├── ffmpeg/
│   │   │   ├── resolver.ts           # locates bundled binary
│   │   │   ├── probe.ts              # ffprobe wrapper
│   │   │   ├── thumbnail.ts          # frame extraction
│   │   │   ├── waveform.ts           # audio peaks
│   │   │   ├── proxy.ts              # proxy generation
│   │   │   └── render.ts             # export pipeline
│   │   └── store/
│   │       └── settings.ts           # electron-store wrapper
│   ├── preload/
│   │   └── index.ts                  # contextBridge exposure
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── MediaBin/
│   │   │   ├── Preview/
│   │   │   ├── Timeline/
│   │   │   │   ├── TimelineRuler.tsx
│   │   │   │   ├── Track.tsx
│   │   │   │   ├── Clip.tsx
│   │   │   │   └── Playhead.tsx
│   │   │   ├── Inspector/
│   │   │   ├── ExportDialog/
│   │   │   └── shared/
│   │   ├── store/
│   │   │   ├── project.ts            # Zustand store
│   │   │   ├── history.ts            # undo/redo stack
│   │   │   └── playback.ts           # transport state
│   │   ├── hooks/
│   │   └── lib/
│   │       └── timecode.ts           # format/parse helpers
│   └── shared/
│       ├── contracts.ts              # IPC types
│       └── models.ts                 # Project/Track/Clip types
├── resources/
│   └── ffmpeg/
│       ├── ffmpeg.exe
│       └── ffprobe.exe
├── build/
│   ├── icon.ico
│   └── installer.nsh
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 5.3 Threading & Performance Model

- Heavy FFmpeg work runs as a child process — never blocks the main thread
- Thumbnail generation is queued: one at a time per imported file, lower priority than user-initiated exports
- Waveform peaks are generated once per media import and cached to `%APPDATA%/VidForge/cache/waveforms/<mediaId>.json`
- The renderer requests only the data it needs to draw the visible timeline region (virtualized scroll)

---

## 6. Data Models

### 6.1 Project File Format

Projects are saved as `.vedit` files — JSON with a top-level schema version. Media is referenced by absolute path; the file does not embed media data.

```typescript
// src/shared/models.ts

export type SchemaVersion = 1;

export interface Project {
  schemaVersion: SchemaVersion;
  id: string;                          // nanoid
  name: string;
  createdAt: string;                   // ISO 8601
  modifiedAt: string;
  settings: ProjectSettings;
  mediaPool: MediaAsset[];
  tracks: Track[];                     // ordered: index 0 = topmost
  markers: Marker[];
  playhead: number;                    // seconds
  inPoint: number | null;
  outPoint: number | null;
}

export interface ProjectSettings {
  fps: 24 | 25 | 30 | 50 | 60;
  resolution: { width: number; height: number };
  sampleRate: 44100 | 48000;
}

export interface MediaAsset {
  id: string;
  filePath: string;                    // absolute
  fileName: string;
  fileSize: number;                    // bytes
  type: 'video' | 'audio' | 'image';
  duration: number;                    // seconds
  metadata: {
    width?: number;
    height?: number;
    fps?: number;
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    audioSampleRate?: number;
    bitrate?: number;
  };
  thumbnailPath?: string;              // path in cache dir
  proxyPath?: string | null;
  waveformCachePath?: string;
  importedAt: string;
}

export interface Track {
  id: string;
  kind: 'video' | 'audio';
  name: string;                        // "V1", "A1", or user-set
  clips: Clip[];                       // sorted by trackTime
  muted: boolean;
  locked: boolean;
  soloed: boolean;
  hidden: boolean;
  height: number;                      // pixels
}

export interface Clip {
  id: string;
  mediaId: string;
  trackTime: number;                   // start position on timeline, seconds
  sourceIn: number;                    // start offset within source media, seconds
  duration: number;                    // seconds (after speed adjustment)
  speed: number;                       // 1.0 = normal; 0.25–4.0
  reversed: boolean;
  volume: number;                      // 0.0–2.0 (audio + video clips with audio)
  fadeInDuration: number;              // seconds
  fadeOutDuration: number;             // seconds
  effects: Effect[];
  linkedClipId?: string;               // pairs video + audio
}

export interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'exposure'
      | 'temperature' | 'tint' | 'transition';
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Marker {
  id: string;
  time: number;                        // seconds
  label: string;
  color: string;                       // hex
}
```

### 6.2 Schema Migration
- All loads check `schemaVersion`. If lower than current, run migration functions in order
- Migration functions live in `src/main/ipc/project.ts` and are pure JSON-to-JSON transforms

### 6.3 Settings File
User preferences stored via `electron-store` at `%APPDATA%/VidForge/settings.json`:

```typescript
export interface UserSettings {
  theme: 'dark' | 'light';
  recentProjects: string[];            // max 10
  defaultExportPreset: string;
  keyboardShortcuts: Record<string, string>;
  hardwareAcceleration: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'off';
  proxyResolution: 360 | 540 | 720;
  autoSaveIntervalSeconds: number;
}
```

---

## 7. IPC Contract

All IPC channels are defined in `src/shared/contracts.ts` and consumed identically by main and renderer.

```typescript
export interface IPCContract {
  // Project
  'project:new': { args: []; result: Project };
  'project:open': { args: [filePath?: string]; result: Project };
  'project:save': { args: [project: Project, filePath?: string]; result: string };
  'project:recentList': { args: []; result: string[] };

  // Media
  'media:import': { args: [filePaths: string[]]; result: MediaAsset[] };
  'media:generateThumbnail': { args: [mediaId: string]; result: string };
  'media:generateWaveform': { args: [mediaId: string]; result: number[] };
  'media:generateProxy': { args: [mediaId: string]; result: string };

  // Export
  'export:start': { args: [project: Project, options: ExportOptions]; result: string };
  'export:cancel': { args: [jobId: string]; result: void };
  // Events (main → renderer)
  'export:progress': { payload: { jobId: string; percent: number; eta: number } };
  'export:complete': { payload: { jobId: string; outputPath: string } };
  'export:error': { payload: { jobId: string; message: string } };

  // System
  'system:detectEncoders': { args: []; result: string[] };
  'system:openInExplorer': { args: [path: string]; result: void };
}

export interface ExportOptions {
  outputPath: string;
  preset: 'mp4_1080p' | 'mp4_720p' | 'mp4_4k' | 'custom';
  customSettings?: {
    width: number;
    height: number;
    fps: number;
    videoCodec: 'libx264' | 'libx265' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';
    audioCodec: 'aac' | 'mp3';
    bitrate?: string;
    crf?: number;
  };
  useInOutPoints: boolean;
}
```

---

## 8. Functional Requirements

Each requirement is numbered for traceability. Priority: **P0** (must, MVP), **P1** (should, v1.1), **P2** (nice-to-have).

### 8.1 Application Lifecycle

| ID | Priority | Requirement |
|---|---|---|
| FR-001 | P0 | App launches via `.exe` shortcut and displays a Start screen within 3 seconds |
| FR-002 | P0 | Start screen shows: New Project button, Open Project button, list of up to 10 recent projects |
| FR-003 | P0 | Closing the last window quits the app on Windows |
| FR-004 | P0 | On unsaved changes, prompt user before quitting |
| FR-005 | P1 | Auto-save triggers every N seconds (default 60), writing to `<project>.vedit.autosave` |
| FR-006 | P1 | On launch, if an autosave is newer than the last saved file, offer to restore |

### 8.2 Project Management

| ID | Priority | Requirement |
|---|---|---|
| FR-010 | P0 | New Project dialog prompts for: name, fps (24/25/30/50/60), resolution preset (1080p, 720p, 4K, custom) |
| FR-011 | P0 | Projects save to user-chosen `.vedit` files via standard Save dialog |
| FR-012 | P0 | Open Project reads `.vedit`, runs schema migration if needed, restores full state |
| FR-013 | P0 | If a referenced media file is missing on load, show "Relink Media" dialog with browse option |
| FR-014 | P0 | Recently opened projects appear in the File menu (most recent first, max 10) |

### 8.3 Media Import

| ID | Priority | Requirement |
|---|---|---|
| FR-020 | P0 | Import via File menu, button, or drag-and-drop onto the Media Bin |
| FR-021 | P0 | Support input formats: MP4, MOV, MKV, AVI, WebM, MP3, WAV, AAC, FLAC, PNG, JPG |
| FR-022 | P0 | For each imported file, run ffprobe and populate `MediaAsset.metadata` |
| FR-023 | P0 | Generate a thumbnail (first non-black frame) for each video asset |
| FR-024 | P0 | Display each asset in the Media Bin as: thumbnail, filename, duration, resolution |
| FR-025 | P1 | Show a progress indicator on assets while metadata/thumbnail generation is in flight |
| FR-026 | P1 | Right-click on a media asset shows: Reveal in Explorer, Remove, Replace, Generate Proxy |
| FR-027 | P0 | Variable frame rate (VFR) media is flagged with a warning icon and a tooltip explaining sync risk |

### 8.4 Timeline

| ID | Priority | Requirement |
|---|---|---|
| FR-030 | P0 | New projects start with 2 video tracks (V1, V2) and 2 audio tracks (A1, A2) |
| FR-031 | P1 | User can add/remove tracks (max 10 video, 10 audio) |
| FR-032 | P0 | Timeline displays a time ruler with timecode (HH:MM:SS:FF) and tick marks |
| FR-033 | P0 | Horizontal zoom via Ctrl+scroll, +/- keys, or zoom slider; range: 1 px/frame to 1 px/minute |
| FR-034 | P0 | Vertical scroll when tracks exceed visible area |
| FR-035 | P0 | Drag a media asset onto a track to create a clip starting at the drop position |
| FR-036 | P0 | Video clips render with a thumbnail strip; audio clips render with a waveform |
| FR-037 | P0 | Drag a clip horizontally to reposition (no overlap allowed on the same track) |
| FR-038 | P0 | Drag a clip vertically to move it to another track of the same kind |
| FR-039 | P0 | Snap-to-edge: dragged clips snap to other clip edges and the playhead within 8 px (toggleable) |
| FR-040 | P0 | Drag the left or right edge of a clip to trim (cannot extend past source media bounds) |
| FR-041 | P1 | Ripple edit mode: trimming a clip shifts all following clips on that track |
| FR-042 | P0 | Multi-select clips via Ctrl+click or marquee selection |
| FR-043 | P0 | Selected clips are visually highlighted |

### 8.5 Editing Operations

| ID | Priority | Requirement |
|---|---|---|
| FR-050 | P0 | Razor tool (C key) splits the clip under the cursor at the click point |
| FR-051 | P0 | Delete key removes selected clips (leaves a gap) |
| FR-052 | P0 | Shift+Delete performs a ripple delete (closes the gap) |
| FR-053 | P0 | Ctrl+C / Ctrl+X / Ctrl+V copy/cut/paste selected clips; paste position = current playhead |
| FR-054 | P0 | Ctrl+Z and Ctrl+Shift+Z undo/redo any editing operation |
| FR-055 | P0 | Undo history is unbounded within a session; cleared on project close |
| FR-056 | P0 | Cutting a clip preserves all properties (volume, effects, speed) on both halves |
| FR-057 | P1 | "Link/Unlink" command (Alt+L) toggles audio+video link on a paired clip |

### 8.6 Playback & Preview

| ID | Priority | Requirement |
|---|---|---|
| FR-060 | P0 | Preview window displays the composited frame at the playhead position |
| FR-061 | P0 | Spacebar toggles play/pause |
| FR-062 | P0 | Left/Right arrows step one frame backward/forward |
| FR-063 | P0 | Shift+Left/Right step 10 frames |
| FR-064 | P0 | J/K/L shuttle: K pause, L play forward, JJ/LL increase speed up to 8×, J reverse |
| FR-065 | P0 | Home/End jump to project start/end |
| FR-066 | P0 | Click on the time ruler jumps the playhead to that position |
| FR-067 | P0 | I and O keys set the in-point and out-point at the current playhead |
| FR-068 | P1 | Loop playback (Ctrl+L) loops between in and out points |
| FR-069 | P0 | Playback respects track visibility and mute states |
| FR-070 | P0 | When playhead is over multiple stacked video clips, render the topmost enabled track (v1: no compositing in preview) |

### 8.7 Audio

| ID | Priority | Requirement |
|---|---|---|
| FR-080 | P0 | Each audio clip has a volume slider (Inspector panel) ranging 0%–200% |
| FR-081 | P0 | Each track has mute and solo buttons |
| FR-082 | P0 | Master volume slider in the top toolbar |
| FR-083 | P1 | Drag handles on audio clip top corners create fade-in/fade-out |
| FR-084 | P1 | Right-click on audio clip → Normalize (uses FFmpeg loudnorm filter, target -16 LUFS) |
| FR-085 | P1 | Master audio peak meter visible during playback |

### 8.8 Text & Titles

| ID | Priority | Requirement |
|---|---|---|
| FR-090 | P1 | Title tool creates a new clip on a video track containing rendered text |
| FR-091 | P1 | Title properties: text content, font family (system fonts), size, color, bold, italic, alignment, x/y position, drop shadow on/off |
| FR-092 | P1 | Title animations: none, fade in, fade out, fade in+out |

### 8.9 Color Correction

| ID | Priority | Requirement |
|---|---|---|
| FR-100 | P1 | Inspector panel for video clips shows: brightness, contrast, saturation, exposure, temperature, tint (all -100 to +100) |
| FR-101 | P1 | Effects preview live in the preview window using CSS filters |
| FR-102 | P1 | At export, effects are applied via FFmpeg `eq` and `colorbalance` filters |
| FR-103 | P1 | "Reset" button on each parameter and "Reset All" on the panel |

### 8.10 Speed & Reverse

| ID | Priority | Requirement |
|---|---|---|
| FR-110 | P1 | Right-click clip → Speed... opens dialog with percentage input (25%–400%) |
| FR-111 | P1 | Reverse checkbox in the same dialog |
| FR-112 | P1 | "Maintain pitch" checkbox for audio (uses FFmpeg `atempo`) |

### 8.11 Export

| ID | Priority | Requirement |
|---|---|---|
| FR-120 | P0 | Export menu (Ctrl+E) opens dialog with presets: 1080p MP4 (H.264), 720p MP4, 4K MP4, Custom |
| FR-121 | P0 | Output file picker with `.mp4` default extension |
| FR-122 | P0 | Progress bar with: percentage, elapsed time, estimated time remaining, cancel button |
| FR-123 | P0 | Default encoder: `libx264` with `-preset medium -crf 20 -pix_fmt yuv420p` |
| FR-124 | P0 | Default audio: AAC, 192 kbps, sample rate matches project setting |
| FR-125 | P0 | Hardware acceleration auto-detect on startup via `ffmpeg -encoders`; expose options in custom export |
| FR-126 | P0 | If in/out points are set, export only that range |
| FR-127 | P0 | On completion, show notification with "Open File" and "Reveal in Explorer" buttons |
| FR-128 | P0 | Single-track, single-clip exports use `-c copy` when codecs match (fast path) |
| FR-129 | P1 | Background export: user can continue editing while a job runs |

### 8.12 Performance Optimization

| ID | Priority | Requirement |
|---|---|---|
| FR-130 | P1 | Right-click media → Generate Proxy creates a 540p H.264 version stored in cache |
| FR-131 | P1 | If proxy exists, preview playback uses it; export switches back to original |
| FR-132 | P0 | Thumbnail and waveform generation runs in the background without blocking the UI |
| FR-133 | P0 | Timeline rendering uses virtualization — only visible clips are mounted |

### 8.13 UX Polish

| ID | Priority | Requirement |
|---|---|---|
| FR-140 | P0 | Dark mode by default; light mode toggle in Preferences |
| FR-141 | P1 | Keyboard shortcut reference dialog (? key) lists all shortcuts |
| FR-142 | P1 | Preferences dialog with sections: General, Editing, Audio, Hardware, Shortcuts |
| FR-143 | P0 | Status bar shows: current playhead timecode, selected clip count, project duration |

---

## 9. Non-Functional Requirements

### 9.1 Performance
- **NFR-001** Cold launch to Start screen: < 3 seconds on minimum spec
- **NFR-002** Open a 100-clip project: < 2 seconds
- **NFR-003** 1080p H.264 preview playback: ≥ 24 fps on minimum spec, ≥ 60 fps on recommended
- **NFR-004** Timeline scroll/zoom: 60 fps with up to 500 clips visible
- **NFR-005** Export speed: real-time or faster for 1080p H.264 → H.264 with hardware acceleration

### 9.2 Reliability
- **NFR-010** Auto-save survives unexpected termination (process kill, power loss)
- **NFR-011** FFmpeg failures must be caught and surfaced as user-readable errors (never a silent failure)
- **NFR-012** Project files written atomically (write to `.tmp`, then rename)

### 9.3 Compatibility
- **NFR-020** Installer runs on Windows 10 (1909+) and Windows 11
- **NFR-021** Output files play in VLC, Windows Media Player, Chrome, Firefox, Edge

### 9.4 Security
- **NFR-030** No telemetry or network calls in v1
- **NFR-031** `nodeIntegration: false`, `contextIsolation: true` in renderer
- **NFR-032** Validate all file paths received via IPC against a list of allowed directories

### 9.5 Maintainability
- **NFR-040** TypeScript strict mode enabled, no `any` without explicit comment
- **NFR-041** All IPC channels typed via shared contract
- **NFR-042** Unit test coverage ≥ 60% on `src/main/ffmpeg/*` and `src/renderer/store/*`

### 9.6 Accessibility
- **NFR-050** All actions reachable via keyboard
- **NFR-051** Tab order is logical across panels
- **NFR-052** Color contrast meets WCAG AA in both themes

---

## 10. User Interface Specification

### 10.1 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ File  Edit  View  Clip  Timeline  Window  Help            ─  □  ✕  │
├─────────────────┬────────────────────────────────┬──────────────────┤
│                 │                                │                  │
│   MEDIA BIN     │         PREVIEW                │   INSPECTOR      │
│                 │                                │                  │
│  [thumb] clip1  │      ┌──────────────┐         │  Selected Clip   │
│  [thumb] clip2  │      │              │         │                  │
│  [thumb] clip3  │      │   (video)    │         │  Volume:  ━━○━━  │
│                 │      │              │         │  Speed:   100%   │
│                 │      └──────────────┘         │  Bright:  ━○━━━  │
│                 │   ◀◀  ◀  ▶  ▶▶   00:01:23.04 │                  │
├─────────────────┴────────────────────────────────┴──────────────────┤
│ TIMELINE                                                            │
│ 00:00       00:05       00:10       00:15       00:20       00:25  │
│ ├──────────────────────────────────────────────────────────────────│
│ V2 │ ▓▓▓▓▓▓▓▓▓                                                    │
│ V1 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓                          │
│ A1 │ ∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼ │ ∼∼∼∼∼∼∼∼∼∼∼∼∼∼                          │
│ A2 │                                                                │
├─────────────────────────────────────────────────────────────────────┤
│ Status: Ready    Playhead: 00:00:08.12    Selected: 1 clip          │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Panel Specs

| Panel | Default size | Resizable | Dockable |
|---|---|---|---|
| Media Bin | 280 px wide | Yes (min 200, max 500) | No (v1) |
| Preview | Flex | Yes | No |
| Inspector | 320 px wide | Yes | No |
| Timeline | 40% of height | Yes | No |

### 10.3 Color Tokens (Dark Theme)
| Token | Value |
|---|---|
| `--bg-app` | `#1a1a1a` |
| `--bg-panel` | `#242424` |
| `--bg-track` | `#2e2e2e` |
| `--bg-clip-video` | `#3b82f6` |
| `--bg-clip-audio` | `#10b981` |
| `--text-primary` | `#e5e5e5` |
| `--text-secondary` | `#a3a3a3` |
| `--accent` | `#f59e0b` |
| `--playhead` | `#ef4444` |
| `--border` | `#404040` |

---

## 11. External Dependencies

### 11.1 FFmpeg Binary
- Source: https://www.gyan.dev/ffmpeg/builds/ (static, full build, GPL)
- Files: `ffmpeg.exe`, `ffprobe.exe`
- Location at build time: `resources/ffmpeg/`
- Bundled via `electron-builder` `extraResources` field
- Resolved at runtime via `path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')` in production, or `path.join(__dirname, '../../resources/ffmpeg/ffmpeg.exe')` in dev
- License: GPL — note in About dialog and README

### 11.2 Hardware Encoder Detection
On first launch, run `ffmpeg -encoders` and parse for the presence of:
- `h264_nvenc` (NVIDIA)
- `h264_qsv` (Intel)
- `h264_amf` (AMD)

Cache result in settings; expose in export dialog.

---

## 12. Build & Packaging

### 12.1 Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-vite build && electron-builder",
    "package:portable": "electron-vite build && electron-builder --win portable",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

### 12.2 electron-builder Config

```yaml
appId: com.isaackim.videoeditor
productName: VidForge
copyright: Copyright © 2026
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
extraResources:
  - from: resources/ffmpeg
    to: ffmpeg
    filter: ["**/*"]
win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  icon: build/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

### 12.3 Build Outputs
- `dist/VidForge-Setup-1.0.0.exe` — installer
- `dist/VidForge-1.0.0-portable.exe` — portable
- `dist/latest.yml` — for future auto-updater

### 12.4 Code Signing
- Out of scope for v1; document in README that unsigned builds may trigger SmartScreen warnings
- Reserve config field for future EV cert

---

## 13. Implementation Phases

Each phase is an independent milestone with acceptance criteria. Do not start phase N+1 until phase N's acceptance criteria pass.

### Phase 0: Project Scaffold
**Goal:** Empty Electron + React + TypeScript app that builds to `.exe`.

**Tasks:**
1. Initialize repo with `electron-vite` template
2. Configure TypeScript strict mode
3. Set up Tailwind CSS
4. Configure `electron-builder` per section 12
5. Add app icon
6. Implement preload script with `contextBridge`
7. Verify `npm run package` produces installable `.exe`

**Acceptance:** Installer creates a desktop shortcut that launches a blank window saying "VidForge".

### Phase 1: Project & Media Foundation
**Goal:** Can open the app, create/save/load projects, import media.

**Requirements:** FR-001 to FR-027, NFR-010, NFR-012, NFR-040, NFR-041

**Tasks:**
1. Implement Start screen
2. Implement Project data model + JSON persistence
3. Implement IPC channels for `project:*`
4. Bundle FFmpeg, implement resolver, probe, thumbnail
5. Build Media Bin component with drag-and-drop import
6. Implement settings persistence (`electron-store`)

**Acceptance:** User can create a new project, drop 5 video files in, see thumbnails and metadata, save, close, reopen, and find the same state.

### Phase 2: Timeline & Playback
**Goal:** Functional editing timeline with playback.

**Requirements:** FR-030 to FR-070

**Tasks:**
1. Build Timeline component with ruler, tracks, virtualized clip rendering
2. Implement drag-and-drop from Media Bin to Timeline
3. Implement clip selection, drag-to-move, edge-trim
4. Build Preview component with HTML5 video element
5. Implement playhead, transport controls, keyboard shortcuts
6. Implement waveform rendering for audio clips

**Acceptance:** User can place 3 video clips on V1, scrub through the timeline, play it back, and see the correct clip at each timecode.

### Phase 3: Editing Operations
**Goal:** Cut, trim, undo/redo all work reliably.

**Requirements:** FR-050 to FR-057

**Tasks:**
1. Implement razor tool (split at playhead)
2. Implement delete + ripple delete
3. Implement copy/cut/paste
4. Implement command-pattern history stack
5. Wire Ctrl+Z / Ctrl+Shift+Z
6. Multi-select with marquee

**Acceptance:** User can split a clip in half, delete the right half, paste it somewhere else, and undo the entire chain back to the original state.

### Phase 4: Audio & Export
**Goal:** Working export pipeline + basic audio controls.

**Requirements:** FR-080 to FR-085, FR-120 to FR-129

**Tasks:**
1. Implement Inspector panel for clip properties
2. Wire volume sliders + track mute/solo
3. Build Export dialog
4. Implement FFmpeg filter graph builder
5. Implement progress reporting via IPC events
6. Implement hardware encoder detection
7. Implement fast-path `-c copy` for trivial exports

**Acceptance:** User can edit a 1-minute project with 2 tracks of video and audio, export to 1080p MP4, and the result plays correctly in VLC with audio in sync.

### Phase 5: v1.0 Polish
**Goal:** Ship-ready application.

**Requirements:** FR-005, FR-006, FR-041, FR-068, FR-100 to FR-103, FR-130 to FR-143

**Tasks:**
1. Auto-save + crash recovery
2. Ripple edit mode
3. Color correction Inspector
4. Proxy generation
5. Keyboard shortcut reference dialog
6. Preferences dialog
7. README, License, About dialog

**Acceptance:** A user unfamiliar with the codebase can install the `.exe`, follow the README, and complete a 5-minute edit without consulting the developer.

---

## 14. Testing Strategy

### 14.1 Unit Tests (Vitest)
- All pure functions in `src/main/ffmpeg/*` (filter graph builder, command construction)
- All Zustand store actions
- Timecode parse/format
- Project schema migrations

### 14.2 Integration Tests (Vitest)
- IPC handlers with mocked FFmpeg child processes
- Project save → reload round-trip preserves all state

### 14.3 End-to-End (Playwright)
Critical user journeys:
1. Launch → New Project → Import file → Drop on timeline → Export → Verify output exists
2. Open Project → Edit → Save → Close → Reopen → State matches

### 14.4 Manual Test Checklist
A checklist in `docs/MANUAL_TESTS.md` covering each P0 requirement; runs before each release.

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FFmpeg static build incompatibility on specific Windows versions | Medium | High | Test on Win 10 1909, Win 11 22H2, and Win 11 23H2 minimum |
| Variable frame rate footage causing sync issues | High | Medium | Detect VFR on import, warn user, document limitation |
| Undo/redo state explosion with large projects | Medium | Medium | Use immer for structural sharing; cap history at 200 entries if performance becomes an issue |
| Antivirus flagging unsigned `.exe` | High | Low | Document SmartScreen workaround in README; plan code signing for v1.1 |
| Preview playback dropping frames on minimum-spec hardware | Medium | Medium | Implement proxy media early; recommend proxy for 4K |
| FFmpeg GPL licensing concerns | Low | Low | Ship under GPL, note in README and About; alternative: switch to LGPL build later |

---

## 16. Appendices

### Appendix A: Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Space | Play / Pause |
| K | Pause |
| J | Reverse / increase reverse speed |
| L | Play forward / increase forward speed |
| ←  /  → | Step 1 frame back / forward |
| Shift+← / → | Step 10 frames back / forward |
| Home / End | Jump to start / end |
| I / O | Set in / out point |
| V | Selection tool |
| C | Razor tool |
| M | Add marker at playhead |
| Delete | Delete selected clips |
| Shift+Delete | Ripple delete |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+C / X / V | Copy / Cut / Paste |
| Ctrl+S / Shift+S | Save / Save As |
| Ctrl+O | Open project |
| Ctrl+N | New project |
| Ctrl+E | Export |
| Ctrl+,| Preferences |
| ? | Show shortcut reference |
| +  /  − | Zoom timeline in / out |

### Appendix B: FFmpeg Command Examples

**Probe metadata:**
```
ffprobe -v quiet -print_format json -show_format -show_streams "<input>"
```

**Generate thumbnail:**
```
ffmpeg -ss 0 -i "<input>" -frames:v 1 -vf "scale=320:-1" "<output>.jpg"
```

**Generate waveform peaks JSON:**
```
ffmpeg -i "<input>" -ac 1 -filter:a "aresample=8000" -map 0:a -c:a pcm_s16le -f data -
```
(Read raw PCM, downsample, compute peaks in JS.)

**Generate 540p proxy:**
```
ffmpeg -i "<input>" -vf "scale=-2:540" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k "<proxy>.mp4"
```

**Render export (filter graph example):**
```
ffmpeg -i clip1.mp4 -i clip2.mp4 -filter_complex \
  "[0:v]trim=0:5,setpts=PTS-STARTPTS[v0]; \
   [1:v]trim=2:8,setpts=PTS-STARTPTS[v1]; \
   [v0][v1]concat=n=2:v=1:a=0[outv]" \
  -map "[outv]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p out.mp4
```

### Appendix C: Glossary

| Term | Definition |
|---|---|
| Clip | An instance of a media asset placed on the timeline, with its own in/out points and properties |
| Media asset | An imported file in the Media Bin (a clip references this) |
| Track | A horizontal lane on the timeline holding clips (video or audio) |
| Ripple edit | Trim or delete that shifts following clips to close the gap |
| Proxy | A lower-resolution version of a media asset used for performance during editing |
| Playhead | The vertical line on the timeline indicating the current playback position |
| In/Out points | Markers defining a region of the project (for export or loop playback) |
| Filter graph | An FFmpeg construct chaining filters together for processing |

---

## End of Document

For implementation: process this document **section by section**. Do not attempt to implement all requirements in a single pass. Begin with Phase 0 (section 13) and stop after each phase to verify acceptance criteria before continuing.
