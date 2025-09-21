# PickShot

## Overview

PickShot is an Electron + React photo culling tool designed for fast triage of large image libraries. It lets you blaze through shoots with star ratings, fluid animations, and keyboard-driven workflows.

> 日本語での詳細な説明は [docs/README.ja.md](docs/README.ja.md) を参照してください。

https://github.com/user-attachments/assets/1f9b17a2-0833-4e67-91cd-03d7ab999726

## Download

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/igz0/pickshot)](https://github.com/igz0/pickshot/releases/latest)

**[📥 Download the latest release](https://github.com/igz0/pickshot/releases/latest)**

- **Windows**: Download the `.exe` installer or `.zip` portable version
- **macOS**: Download the `.dmg` file (Intel and Apple Silicon supported)
- **Linux**: Download the `.AppImage` file

## Highlights

- Recursively scans photo folders (hidden files are skipped) for fast bulk importing.
- Virtualized grid powered by `react-window` and `AutoSizer` keeps thousands of thumbnails responsive.
- Background thumbnail generation with `sharp` and custom `photo://` / `photo-thumb://` protocols for streaming.
- Star ratings are editable from both cards and preview, with smooth transitions to surface favorites.
- Ratings persist through `better-sqlite3`, and `exiftool-vendored` syncs metadata when available.
- Built-in sorting (modified date, name, rating), rated/unrated filters, full-screen preview, rename, delete, and reveal-in-finder actions.
- Keyboard shortcut overlay (`Shift + ?`) plus bindings such as `Cmd/Ctrl + O`, `0-5`, `[` `]`, and `Delete` for mouse-free review sessions.
- Tailwind CSS dark theme with a resizable preview pane on desktop layouts.

## Keyboard Shortcuts

- `Cmd / Ctrl + O`: Load a folder
- `Arrow Left / Right` + `Shift`: Jump to the start or end of the current list
- `0-5`, `[` `]`: Set, clear, and adjust star ratings
- `F`: Cycle the visibility filter (all / rated / unrated)
- `S`: Cycle sort order
- `Delete / Backspace`: Move the selected photo to the trash
- `Esc`: Clear the current selection
- `Shift + ?`: Toggle the shortcuts overlay

## Data Persistence & Metadata Sync

- Ratings are stored at `app.getPath('userData')/pickshot/ratings.db`, surviving app restarts.
- Thumbnails are cached as WebP under `userData/thumbnails/`, regenerating only when source files change.
- When `exiftool-vendored` is available, ratings are read from and written back to file metadata, with automatic fallbacks for slow volumes or timeouts.

## Internationalization

- English is the default locale. When the OS reports a Japanese UI preference, PickShot automatically switches to Japanese.

## Project Structure

- `src/main/`: Boots the Electron app, registers custom protocols, drives the thumbnail queue, and wires IPC handlers.
- `src/main/db/ratingsStore.ts`: `better-sqlite3` wrapper for persisting ratings (with legacy migration).
- `src/main/metadata/ratingMetadata.ts`: Bridges `exiftool-vendored` to sync star ratings to file metadata, handling slow volumes and timeouts.
- `src/preload/`: Defines the secure `window.api` bridge exposed to the renderer.
- `src/renderer/`: React UI composed of the grid, preview, context menu, rename dialog, rating stars, and supporting components.
- `src/shared/`: Shared TypeScript types and utilities reused across processes.

## Development Environment

- Node.js 24.8.0 / npm 10.8.2 pinned via Volta.
- macOS requires Xcode Command Line Tools; Windows requires Visual Studio Build Tools for native module compilation.

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` watches the main, preload, and renderer processes with hot reload.

### Rebuilding Native Modules

Run this after changing Electron or native dependencies such as `better-sqlite3` or `sharp`:

```bash
npm run rebuild-native
```

## Available Scripts

- `npm run dev`: Launch electron-vite with hot reload.
- `npm run preview`: Serve the renderer bundle alone for quick UI spot checks.
- `npm run build`: Output production bundles into `dist/`.
- `npm run package`: Build installers for all targets into `release/`.
- `npm run package:mac` / `npm run package:win`: Package for macOS / Windows only.
- `npm run lint`: Biome static analysis (read-only).
- `npm run lint:fix`, `npm run lint:fix-unsafe`: Apply Biome autofixes (safe / including risky transforms).
- `npm run format`: Repository-wide formatting pass.

## Manual QA Checklist

Test the following flows in `npm run dev`:

- Loading multiple folders, verifying recursive discovery and thumbnail generation.
- Persisting ratings between sessions and syncing to metadata when `exiftool` is available.
- Applying filters and sort orders, including rated/unrated toggles.
- Renaming, deleting, and revealing files in Finder/Explorer.
- Entering full-screen preview and navigating via keyboard shortcuts.
- Verifying that the UI follows the OS language (English by default, Japanese on JA systems).

## License

MIT
