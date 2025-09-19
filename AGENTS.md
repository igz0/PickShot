# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/`, split along Electron process boundaries.
  - `src/main/index.ts` boots the application window, registers the `photo://` and `photo-thumb://` protocols, pumps the thumbnail queue, and wires IPC handlers for folder selection, deletion, rename, rating, and reveal operations.
  - `src/main/db/ratingsStore.ts` wraps the `better-sqlite3` database under the user's data directory (with legacy migration), exposing `initRatingsStore`, CRUD helpers, and WAL tuning.
  - `src/main/metadata/ratingMetadata.ts` fronts `exiftool-vendored` so star ratings can be read from and written to file metadata, with safeguards for slow volumes and timeouts.
  - `src/preload/index.ts` exposes the typed `window.api` bridge, keeping the renderer in a sandbox while forwarding IPC calls.
  - `src/renderer/` houses the React UI: `App.tsx` orchestrates view state, `components/` contains the photo grid, preview, context menu, rename dialog, and rating stars, `main.tsx` mounts the app, `tailwind.css` pulls in Tailwind layers, and `global.d.ts` declares the preload contract.
  - `src/shared/types.ts` defines request/response payloads reused across processes.
- Static assets (icons, etc.) live in `assets/`. Build output lands in `dist/` (split into `main/`, `preload/`, and `renderer/`) and packaged artifacts are emitted into `release/`; both stay untracked.
- Key configuration sits at `electron.vite.config.ts`, `tsconfig.json`, `tailwind.config.cjs`, `postcss.config.cjs`, and `biome.json`. Prefer the path aliases from `tsconfig.json` (`@renderer/*`, `@main/*`, `@preload/*`, `@shared/*`) instead of long relative imports.

## Build, Test, and Development Commands
- Install dependencies with `npm install`. Volta pins Node.js 24.8.0 / npm 10.8.2 for repeatable builds.
- Native modules (`better-sqlite3`, `sharp`) rebuild against the current Electron version via `npm run rebuild-native`; this runs automatically on `postinstall`, but run it manually after changing Electron or native deps.
- `npm run dev` launches electron-vite with hot reload across main, preload, and renderer processes.
- `npm run preview` serves the renderer bundle alone for quick UI checks without Electron.
- `npm run build` produces production bundles in `dist/`.
- Packaging helpers: `npm run package` (all targets), `npm run package:mac`, and `npm run package:win` (writes installers to `release/`).

## Tooling, Formatting & Naming Conventions
- TypeScript runs in strict mode; keep surface-area types explicit and share them from `src/shared` to avoid duplication.
- Biome handles formatting, linting, and import sorting. Use:
  - `npm run lint` for read-only analysis on `src/`.
  - `npm run lint:fix` (safe autofix) or `npm run lint:fix-unsafe` (includes risky transforms) when you need edits.
  - `npm run format` if you need a repo-wide style sweep.
- Follow repository defaults: two-space indentation, single quotes, trailing commas where valid.
- React files/components use PascalCase (`PhotoGrid.tsx`), hooks use the `use` prefix, module-local utilities stay camelCase. Favor function components and hooks over classes.
- Tailwind powers styling; extend tokens in `tailwind.config.cjs` and import `tailwind.css` from components instead of ad-hoc CSS.

## Testing Guidelines
- Automated tests are not wired yet. When adding them, colocate Vitest/Testing Library specs under `src/renderer/__tests__/` or `src/shared/__tests__/`, mirroring the path aliases, and introduce an `npm run test` script once tooling lands.
- Until then, manually verify critical flows through `npm run dev`: multi-folder loading, thumbnail generation, rating persistence (including metadata sync), favorites animation, rename/delete actions, and reveal-in-finder.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `chore:`) with concise, imperative summaries (~72 characters) and descriptive bodies when needed.
- Group related changes per commit; do not intermingle refactors with feature work.
- Pull requests should describe the user-facing outcome, note notable refactors, mention affected directories, and include screenshots or screen recordings for UI changes.
- Reference relevant issues and list manual test steps so reviewers can reproduce them quickly.
