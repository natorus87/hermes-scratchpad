# Hermes Scratchpad

An AI-native text, notes and snippet editor as a **Hermes Desktop plugin** —
Sublime-Text-style scratchpads, local file editing, snippets, AI selection
actions through Hermes, and one-keystroke conversion of notes into real Hermes
Kanban tasks.

**v0.2.** See `docs/SDK-NOTES.md` for the inspected-environment findings this
implementation is built on, `docs/REPORT.md` for the verification evidence,
and `AGENTS.md` for contributor/agent constraints.

## What it does

- **Full workspace page** at `#/scratchpad` (sidebar nav row + ⌘K palette
  commands + status-bar chip).
- **CodeMirror 6 editor**: syntax highlighting (Markdown, Shell, Python, JS/TS,
  JSON, YAML, TOML, SQL, HTML, CSS), line numbers, active line, search/replace
  (⌘F in-editor), bracket matching, auto-close brackets, indent with tab/spaces,
  word wrap toggle, undo/redo.
- **Scratchpads** — pathless documents, auto-persisted (debounced) through
  plugin storage; a Hermes restart does not lose them. Rename via double-click
  in the sidebar, ⌘⌥R, or the palette command (Enter commits, Escape cancels).
- **File documents** — open (native dialog), save, save-as with atomic writes;
  the file on disk is the source of truth; dirty indicators per tab.
- **Tabs** with dirty markers, close (confirm on unsaved files), session
  restore; per-doc selection + undo history survive tab switches AND full app
  restarts (persisted `docStates`, text-validated on restore, size-capped).
- **Sidebar search** (⌘⌥F): filters scratchpads by name and content, snippets
  by title/tags/content, and files by name and content (file contents of
  closed tabs are read lazily through the backend, once per session).
- **AI actions** (⌘K popup inside the editor): Improve, Shorten, Structure,
  Explain, Fix, Refactor, Generate Code/Shell/Script, Ask Hermes. Results are
  ALWAYS shown in a preview dialog with a line diff (word-level highlighting
  for changed words) and explicit Replace Selection / Insert Below /
  Replace Document / Copy / Cancel buttons. Nothing is ever applied
  automatically. Generated shell commands/scripts are never executed.
- **AI providers & persona** (⚙ in the AI popup or palette "AI Settings"):
  default **Hermes Gateway** (dedicated hidden session tagged
  `source: hermes-scratchpad`, optional agent-profile and model overrides —
  available profiles are suggested from `profiles.list`), or **Ollama**
  (local), or any **OpenAI-compatible** HTTP API. An optional persona preamble
  rides along with every request. Every action can override the provider and
  define its own prompt template (placeholders `{{text}}`, `{{language}}`,
  `{{question}}`; empty = built-in prompt). Alternate-provider HTTP is
  proxied through the plugin backend (`/ai/proxy`, http/https only, size- and
  timeout-capped) because the page runs on an opaque origin — note the proxy
  runs wherever the backend runs (remote connection ⇒ `127.0.0.1` is the
  remote machine).
- **Kanban** — Create Hermes Task from selection or document: localized
  dialog with title (AI title suggestion optional), description with source
  context, board and priority. Tasks are created through the plugin's own
  Python backend, which delegates to `hermes_cli.kanban_db` (the same library
  the official Kanban board uses) and parks them in the **triage** lane so a
  note never auto-dispatches to a worker.
- **Snippets** — save selection/document as a snippet with tags (comma/
  semicolon separated) and favorite flag; edit title/tags/favorite via the ✎
  button (two-step delete); search matches tags; insert at cursor or open as
  a scratchpad.
- **German + English UI** — follows the app locale (`system`) with a manual
  System/Deutsch/English override in the status bar; persisted across restarts.

## Keybinds

`⌘N ⌘O ⌘S ⌘F ⌘W ⌘K` etc. are **core Hermes built-ins a plugin cannot shadow**;
the documented plugin namespace is `⌘⌥<letter>` (all rebindable in Settings):

| Shortcut | Command |
|---|---|
| ⌘⌥D | New scratchpad (⌘⌥N is owned by the bundled Kanban plugin) |
| ⌘⌥O | Open file |
| ⌘⌥S | Save |
| ⌘⌥⇧S | Save as |
| ⌘⌥W | Close tab |
| ⌘⌥R | Rename active scratchpad |
| ⌘⌥F | Sidebar search |
| ⌘⌥I | Improve with AI |
| ⌘⌥K | AI popup (plain ⌘K also works while the editor has focus) |
| ⌘⌥A | Create Kanban task (⌘⌥T is a core keybind) |

Inside the editor, plain `⌘S` / `⌘⇧S` / `⌘K` / `⌘F` work via CodeMirror keymaps.

## Architecture

```
Editor Core (no Hermes coupling)
├── documents/   Document model (scratch/file), tabs, snippets (nanostores)
├── editor/      CodeMirror 6 setup + language registry
├── commands/    CommandRegistry (stable slugs, localized labels)
├── storage/     Debounced persistence over ctx.storage
├── filesystem/  FileSystemAdapter (ctx.os dialogs + backend fs routes)
├── ai/          AIProvider interface + actions + diff
│   ├── config.ts             provider config (persisted) + defaults
│   ├── registry.ts           providerFor(): hermes | ollama | openai
│   ├── proxyFetch.ts         HTTP for alt. providers via backend /ai/proxy
│   └── providers/
│       ├── hermes.ts         HermesAIProvider (host.request + message events,
│       │                     hidden session with source/profile/model, persona)
│       ├── ollama.ts         Ollama /api/chat (non-streaming)
│       └── openai.ts         any OpenAI-compatible /chat/completions
├── kanban/      KanbanAdapter → ctx.rest → plugin backend → kanban_db
├── i18n/        en/de bundles + resolution (system / override)
├── ui/          React components (jsx() calls, injected plugin stylesheet)
└── plugin/      Entry + controller (orchestration)

backend/          Python plugin (manifest.json + plugin_api.py)
                  → /api/plugins/hermes-scratchpad/{boards,tasks,fs/*,ai/proxy}
```

The desktop half is a single bundled ESM file (`dist/plugin.js`, ~750 kB
including CodeMirror) — the loader resolves only `@hermes/plugin-sdk`,
`react`, `react/jsx-runtime`; everything else is bundled. `npm run verify:bundle`
enforces that.

## Development

```bash
npm install
npm run build          # esbuild → dist/plugin.js
npm run verify:bundle  # no forbidden imports
npm test               # vitest unit tests
npm run typecheck
npm run install:local  # install into ~/.hermes (desktop + backend halves)

# Real-app checks against the CDP dev instance (see docs/DEVELOPMENT.md for
# how to start it): non-destructive smoke checks — page regions, sidebar
# search, dialogs, screenshot.
node scripts/verify-cdp.mjs           # all checks
node scripts/verify-cdp.mjs --list    # available checks
```

After `install:local`:

1. `plugins.enabled` in `~/.hermes/config.yaml` must contain
   `hermes-scratchpad` (one-time).
2. Restart the Hermes backend once (desktop app restart) so
   `/api/plugins/hermes-scratchpad/` is mounted.
3. The desktop half hot-reloads on every build+copy; ⌘K → *Reload desktop
   plugins* as a fallback.

## Security notes

- No CDN/remote code; no dynamic imports in the artifact.
- No secrets stored beyond what the user enters in AI settings (an optional
  OpenAI-compatible API key lives in plugin storage and is only sent to the
  endpoint the user configured); plugin storage holds documents, settings,
  snippets only.
- Filesystem writes happen only through explicit user workflows (save/save-as),
  atomically, size-capped (8 MiB), UTF-8 text only.
- The `/ai/proxy` backend route only relays HTTP(S) requests issued by the AI
  providers the user configured — it is not reachable by other plugins and
  adds no allowlist beyond scheme/size/timeout caps by design (the backend is
  the user's own agent process).
- Kanban tasks are never created implicitly and never auto-dispatched; backend
  failures never modify editor content.
