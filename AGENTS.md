# AGENTS.md — Hermes Scratchpad

Guidance for AI agents (and humans) working in this repository.

## What this repo is

**Hermes Scratchpad** — a desktop plugin for the *installed* Hermes Desktop
app: an AI-native text/notes/snippet editor (scratchpads, local files,
snippets, AI selection actions, Kanban task creation).

It ships as TWO halves (see `docs/SDK-NOTES.md` for why):

| Half | Source | Installed to |
|---|---|---|
| Desktop UI (single ESM file, CodeMirror bundled) | `src/` → esbuild → `dist/plugin.js` | `~/.hermes/desktop-plugins/hermes-scratchpad/plugin.js` |
| Python backend (Kanban, file IO, AI proxy) | `backend/` | `~/.hermes/plugins/hermes-scratchpad/` (+ `__init__.py` with no-op `register()`) |

`npm run install:local` copies both into `$HERMES_HOME` (default `~/.hermes`).
Nothing outside `$HERMES_HOME` is touched; no Hermes Core source files are
ever modified.

## Hard constraints (violations break loading or the user's app)

1. **`dist/plugin.js` is a single uncompiled ESM file.** It may import ONLY
   `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`. Everything else
   (CodeMirror etc.) must be bundled. Enforce with `npm run verify:bundle` —
   run it after every build.
2. **No JSX syntax** anywhere that ends up in `dist/plugin.js` — the disk
   plugin file loads uncompiled. Write UI with `jsx()`/`jsxs()` from
   `react/jsx-runtime`. (The local `src/plugin/sdk-shim.d.ts` types the SDK;
   `@hermes/plugin-sdk` is resolved by the app at runtime, not installed.)
3. **No hardcoded colors** in plugin UI — use Hermes theme CSS variables
   (`--ui-*`, `--foreground`, `--chrome-action-hover`, …) with safe fallbacks.
   The plugin stylesheet lives in `src/ui/styles.ts` (injected at register).
4. **Keybind conflicts are real.** Core owns `mod+n/o/f/w/k/j/t/shift+s`;
   the bundled Kanban plugin owns `mod+alt+n`. Our defaults use the
   `mod+alt+<letter>` namespace (currently D/O/S/⇧S/W/I/K/A/R/F). Before
   adding a new default, grep the app source (a Hermes Agent checkout):
   `grep -rn "defaults: \[" <hermes-agent>/apps/desktop/src`
5. **No cross-plugin REST, no Kanban JSON-RPC.** Kanban goes through our own
   backend (`ctx.rest` → `/api/plugins/hermes-scratchpad/*`) which calls
   `hermes_cli.kanban_db` — never write the kanban SQLite DB directly.
6. **Safe AI/filesystem behavior is a product requirement**, not style:
   AI results ALWAYS go through the preview dialog (never auto-apply);
   generated shell/scripts are never executed; file writes only via explicit
   user workflows; backend failures must never modify editor content.
7. **All user-facing strings** go through `src/i18n/{en,de}.ts` (flat dotted
   keys, `t('command.new')` style). en and de key sets must stay identical —
   a test enforces this. Adding a language = new bundle file + entry in
   `src/i18n/index.ts`.

## Environment facts (verified 2026-10-04 against Hermes Agent v0.21.5)

- Hermes Agent v0.21.5 git install at `~/.hermes/hermes-agent`; its source
  tree IS the documentation (desktop SDK doc:
  `website/docs/developer-guide/desktop-plugin-sdk.md`; RPC contracts:
  `apps/shared/src/gateway-contract.generated.ts`).
- `$HERMES_HOME` defaults to `~/.hermes`. The desktop plugin dir is watched —
  saving `~/.hermes/desktop-plugins/hermes-scratchpad/plugin.js` hot-reloads
  the plugin in the running app within seconds (fallback: ⌘K → "Reload
  desktop plugins").
- The Python backend mounts only when `hermes-scratchpad` is in
  `plugins.enabled` in `~/.hermes/config.yaml` AND the backend restarted
  after install.
- The desktop connection mode (local vs. remote gateway) decides which
  machine's filesystem the backend routes touch — see `docs/DEVELOPMENT.md`.

## Commands

```bash
npm run typecheck      # tsc --noEmit (must be clean)
npm test               # vitest unit tests
npm run build          # esbuild → dist/plugin.js
npm run verify:bundle  # import audit of dist/plugin.js
npm run install:local  # copy both halves into ~/.hermes
node scripts/cdp.mjs eval "<js>"   # inspect the RUNNING dev app's renderer (port 9333)
node scripts/cdp.mjs shot /tmp/x.png
node scripts/verify-cdp.mjs        # non-destructive real-app smoke checks
```

A CDP-visible dev instance (needed for real-app verification; the packaged app
never opens CDP): quit the packaged app first (single-instance lock), then
serve the vite dev server via
`cd ~/.hermes/hermes-agent/apps/desktop && HERMES_DESKTOP_CDP_PORT=9333 npm run dev`.
`window.__hermesScratchpad` exposes the controller in the renderer for tests.

## Debugging rules

- Reproduce → read logs (`~/.hermes/logs/desktop.log`, `errors.log`, `gui.log`)
  → smallest fix → `build` + `verify:bundle` + copy → hot reload → retest.
- Renderer plugin errors appear in `desktop.log` as
  `[error-boundary:contrib:plugin:hermes-scratchpad:...]`.
- Never report untested behavior as working; the Definition of Done is the
  real user journey in the installed app (see `docs/REPORT.md`).
