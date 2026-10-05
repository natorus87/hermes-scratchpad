# Hermes Scratchpad — installed-environment findings

Source of truth: the locally installed Hermes stack, inspected 2026-10-04.
Everything below was verified on disk (app bundle, `~/.hermes/hermes-agent`
git checkout, installed docs) before any implementation code was written.

## Environment

| Item | Value |
|---|---|
| Hermes Desktop | Electron app `com.nousresearch.hermes`, running from `~/.hermes/hermes-agent/apps/desktop/release/mac-arm64/Hermes.app` (dev-release build; `/Applications/Hermes.app` points at the same bundle). Renderer runs with `--lang=de` (German system). |
| Hermes Agent | `v0.21.5+5432.g1798b33 (2026.9.24)`, git install at `~/.hermes/hermes-agent` — full source + docs of both agent AND desktop app are on disk. |
| `$HERMES_HOME` | `~/.hermes` (default, no named profile) |
| Desktop plugin dir | `~/.hermes/desktop-plugins/<id>/plugin.js` — single plain-ESM file, folder name == plugin `id`, watched by the app: loads within seconds and **hot-reloads on every save**. ⌘K → *Reload desktop plugins* as fallback. |
| Python plugin dir | `~/.hermes/plugins/<id>/` — user plugins; a `dashboard/manifest.json` + `dashboard/plugin_api.py` backend is mounted at `/api/plugins/<id>/` **only when the id is in `plugins.enabled` in `config.yaml`** (mount happens at backend startup). |
| App locale | `display.language` unset → OS inference; German is a bundled app locale, so the app UI (and `ctx.i18n`) resolves to `de` on this Mac. |
| Logs | `~/.hermes/logs/` (desktop `gui` log etc.); in-app: `host.logs(...)` |
| Gateway | launchd service stopped; the desktop app spawns/owns its own backend child (HTTP listener on `localhost:47891`). `/api/*` and the JSON-RPC WebSocket are served by that backend. |

## The actual Desktop Plugin SDK (vs. the task prompt's guesses)

The task prompt's guessed API names (workspace/page APIs, `window.hermesDesktop`,
`@hermes/plugin-sdk` npm package) mostly do not exist under those names. The real
surface is documented in
`~/.hermes/hermes-agent/website/docs/developer-guide/desktop-plugin-sdk.md` and the
skill `~/.hermes/skills/autonomous-ai-agents/hermes-agent/references/desktop-plugins.md`.

Key facts that shaped the architecture:

1. **A desktop plugin is ONE ESM file, loaded uncompiled.** Only three import
   specifiers resolve: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
   No JSX syntax. → CodeMirror and everything else must be **bundled into
   `dist/plugin.js`** (esbuild, those three specifiers external), exactly as the
   prompt's §9 anticipated. `npm run verify:bundle` checks the output.
2. **Contribution areas** (all registered through `ctx.register`):
   - `ROUTES_AREA` (`data: {path}`) — full workspace page (the editor UI).
   - `SIDEBAR_NAV_AREA` (`data: {path, label, codicon}`) — sidebar row.
   - `PALETTE_AREA` (⌘K palette commands) and `KEYBINDS_AREA` (rebindable shortcuts).
   - `STATUSBAR_AREAS.left/.right` — status chips.
   - `PANES_AREA`, `THEMES_AREA`, `TRANSCRIPT_DIRECTIVE_AREA`, … (not needed for MVP).
3. **`host.request(method, params)`** is the gateway JSON-RPC door (same calls the
   app makes). Verified method contracts in `apps/shared/src/gateway-contract.generated.ts`:
   - `session.create` `{title?, hidden?, cwd?, idempotency_key?, …}` → `{session_id, stored_session_id, …}`
   - `prompt.submit` `{session_id, text, display_kind?}` → `{status}` (`'streaming'|'queued'|…`)
   - `session.title` `{session_id, title}`
   - events via `host.onEvent`: `message.delta` `{text}`, `message.complete` `{text?, status?, error?…}` — envelopes carry `session_id`.
   → **HermesAIProvider**: one persistent hidden session ("Hermes Scratchpad"),
   one-shot turns per AI action, response assembled from deltas, settled by
   `message.complete`. No composer DOM access (supported API only).
4. **`ctx.os`** is the curated OS door and includes **native file dialogs**:
   `pickOpenPath({filters,title})`, `pickSavePath({defaultPath,filters,title})`,
   plus `revealPath`, `writeClipboard`, `openExternal`, `notify`.
5. **`ctx.rest(path, opts)`** is scoped BY CONSTRUCTION to `/api/plugins/<own-id>/`
   (traversal rejected) — no cross-plugin REST, no core-route access.
   There is **no Kanban JSON-RPC** (checked `gateway-contract.generated.ts`).
6. **Kanban integration**: the official Kanban desktop plugin talks to its own
   Python backend (`plugins/kanban/dashboard/plugin_api.py`), which is a thin
   wrapper around `hermes_cli.kanban_db` (the same module the CLI and dispatcher
   use). → Hermes Scratchpad ships its **own user Python plugin**
   (`~/.hermes/plugins/hermes-scratchpad/dashboard/plugin_api.py`) exposing
   `GET /boards` and `POST /tasks`, delegating to the same `hermes_cli.kanban_db`
   library — an isolated `KanbanAdapter`, no raw DB writes in the plugin, no
   Hermes Core modifications. Enabled via `plugins.enabled` in `config.yaml`.
7. **File IO for File Documents**: dialogs come from `ctx.os`; content read/write
   goes through our own backend (`GET/POST /fs` in `plugin_api.py`, size-capped,
   atomic write via tempfile+`os.replace`). The Electron renderer bridge also has
   `readFileText`/`writeTextFile`, but bridge-direct access is discouraged for
   plugins; the REST door keeps everything profile-scoped and adapter-isolated.
8. **i18n**: `ctx.i18n.register({en, de, …})` + `usePluginI18n(id)` resolve
   against the app's active locale (German here) with English fallback, and
   re-render on locale switch. A manual System/Deutsch/English override is
   implemented on top (plugin setting), keeping `en`/`de` bundles in
   `src/i18n/{en,de}.ts`.
9. **Persistence**: `ctx.storage.get/set/remove` (namespaced JSON under
   `hermes.plugin.<id>.`). Debounced for scratchpad content.
10. **Keybind reality-check**: `mod+n` (new session), `mod+o`, `mod+f`, `mod+w`,
    `mod+k` (palette), `mod+shift+s`, `mod+j`, `mod+t` are core built-ins a plugin
    cannot shadow. The documented plugin namespace is `⌘⌥<letter>`. Defaults used:
    ⌘⌥N new scratchpad, ⌘⌥O open file, ⌘⌥S save, ⌘⌥⇧S save as, ⌘⌥W close tab,
    ⌘⌥F find, ⌘⌥K AI popup. All are user-rebindable in Settings. Inside the
    editor, CodeMirror keymaps accept the plain ⌘-variants (⌘S etc.) while focus
    is in the page. (Deviation from the prompt's §11 preferred shortcuts, forced
    by core conflicts — documented, not a silent fallback.)

## Plugin layout on disk (installed)

```
~/.hermes/desktop-plugins/hermes-scratchpad/plugin.js   ← built bundle (hot reload)
~/.hermes/plugins/hermes-scratchpad/
├── plugin.yaml                      (description only)
└── dashboard/
    ├── manifest.json                { name: hermes-scratchpad, api: plugin_api.py }
    └── plugin_api.py                Kanban + file routes (kanban_db)
```

`plugins.enabled` must contain `hermes-scratchpad`, and the backend (gateway)
must be restarted once for the API mount; the desktop plugin half hot-reloads.
