# Repository Guidelines

## Project Structure & Module Organization
The app is split between a React/Vite frontend and a Tauri/Rust backend.

- `src/`: frontend entrypoints (`main.tsx`, `tray.tsx`), pages, shared UI, Zustand stores, service adapters, and utility code.
- `src/components/ui/`: reusable UI primitives; keep page-specific composition in `src/pages/`.
- `src/services/`, `src/stores/`, `src/lib/`: business logic and testable helpers. Unit tests live beside these modules in `__tests__/`.
- `src-tauri/src/`: Tauri commands and sing-box integration. Storage, process control, and native helpers live here.
- `src-tauri/icons/` and `src-tauri/binaries/`: packaged desktop assets and external binaries.
- `docs/`: supporting project documentation.

## Build, Test, and Development Commands
- `npm run dev`: start the Vite frontend on `http://localhost:1420`.
- `npm run tauri dev`: run the desktop app with the Tauri shell and frontend together.
- `npm run build`: type-check with `tsc --noEmit` and build the frontend bundle into `dist/`.
- `npm test`: run the Vitest suite once in `jsdom`.
- `npm run test:watch`: keep Vitest running during frontend work.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests when backend logic changes.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`: format Rust code before opening a PR.

## Coding Style & Naming Conventions
Use TypeScript with strict compiler settings and React function components. Follow the existing style: 2-space indentation in TS/TSX, double quotes, and semicolons. Use `PascalCase` for components and pages, `camelCase` for functions and store actions, and descriptive file names such as `SubscriptionsPage.tsx` or `subscription_fetch.rs`. Keep imports using the `@/` alias when referencing `src`.

## Testing Guidelines
Vitest is the primary frontend test runner. Add or update tests in sibling `__tests__` folders using `*.test.ts` names, for example `src/services/__tests__/subscriptions.test.ts`. Cover store/service behavior and parsing helpers when logic changes. There is no published coverage threshold, so treat changed code as the minimum surface that must be exercised.

## Commit & Pull Request Guidelines
Recent history uses Conventional-style prefixes like `feat:` and `docs:`; continue that pattern with short imperative summaries. PRs should explain the user-visible change, note any backend or Tauri implications, link the related issue, and include screenshots for UI changes. Call out config-sensitive changes such as tray behavior, system proxy handling, or packaged binaries.
