# Hermes Scratchpad — Implementation & Verification Report

Date: 2026-10-04/05 · Tested against the installed Hermes Desktop app.

## Environment

```text
Hermes Desktop version:   com.nousresearch.hermes 0.0.0 (dev release), Electron, renderer v0.21.5+5432
Hermes Agent version:     v0.21.5+5432.g1798b33 (2026.9.24), git install in ~/.hermes/hermes-agent
macOS version:            darwin 27.0.0 arm64
Active Hermes profile:    default ($HERMES_HOME=~/.hermes); the desktop app also manages an SSH-remote gateway
Plugin install paths:     ~/.hermes/desktop-plugins/hermes-scratchpad/plugin.js   (desktop half, hot reload)
                          ~/.hermes/plugins/hermes-scratchpad/                    (Python backend half)
```

## Architecture (short version — details in README.md and docs/SDK-NOTES.md)

- **Editor core** (`src/`) with no Hermes coupling: `documents/` (document model, tabs, snippets), `editor/` (CodeMirror 6, 12 languages), `commands/`, `storage/` (debounced), `i18n/` (en/de; `system` follows the app locale, manual override), `ui/` (`jsx()` components, injected stylesheet using only theme variables).
- **FileSystemAdapter**: native dialogs via `ctx.os.pickOpenPath/pickSavePath`; content through the plugin's own backend (`/fs/read`, `/fs/write`: UTF-8, 8 MiB cap, atomic via tempfile + `os.replace`).
- **AIProvider** interface + **HermesAIProvider**: one hidden, plugin-owned session (`session.create`), turns via `prompt.submit`, response assembled from `message.delta`/`message.complete` events. No composer DOM access.
- **AI providers**: Hermes gateway (default), Ollama, any OpenAI-compatible HTTP API — behind one interface, with per-action provider overrides and prompt templates; alternate-provider HTTP goes through the backend `/ai/proxy` route (http/https only, size- and timeout-capped).
- **AI actions**: Improve / Shorten / Structure / Explain / Fix / Refactor / Generate Code / Generate Shell / Generate Script / Ask via the ⌘K popup; results are **always** shown in a preview dialog with a line diff (word-level segments) and explicit buttons (Replace Selection / Insert Below / Replace Document / Copy / Cancel).
- **KanbanAdapter** → `ctx.rest` → own Python backend (`backend/plugin_api.py`) → `hermes_cli.kanban_db` (the same library the official Kanban board uses). Tasks land in **triage** (no auto-dispatch). Backend failures never modify editor content.
- **Build**: esbuild → one file `dist/plugin.js` (~770 kB incl. CodeMirror); `npm run verify:bundle` enforces the import restriction; 58 vitest unit tests.

## Hermes APIs used (verified against the installed source beforehand)

- **Public SDK**: contribution areas, `ctx.storage/os/i18n/rest`, `host.request`, `host.onEvent`, `host.navigate`, `host.notify`, `usePluginI18n`, `useValue`.
- **Desktop bridge**: only indirectly through the curated `ctx.os` doors (dialogs, clipboard, reveal).
- **Gateway JSON-RPC**: `session.create`, `prompt.submit` (+ `message.*` events), `profiles.list`.
- **Internal API (isolated in adapter/backend)**: `hermes_cli.kanban_db` — no direct DB access, no Hermes Core modifications.

## Test matrix (real app: CDP + logs + screenshots)

```text
Plugin load:                PASS  — sidebar row in the live DOM; no loader errors in desktop.log
German UI:                  PASS  — palette, dialogs, status bar in German (screenshots)
English UI:                 PASS  — everything English after override
Language switching:         PASS  — de↔en live; override survives a full restart
Scratchpad persistence:     PASS  — 5 tabs + contents restored after quit/relaunch
File open/save:             PASS  — test file opened, edited, ⌘S, byte comparison OK
Tabs:                       PASS  — switching, dirty markers, dirty-close confirm, session restore
Syntax highlighting:        PASS  — Python, Markdown, YAML token spans in the live DOM
AI action:                  PASS  — "Improve" over a selection; result received from Hermes
AI preview/apply:           PASS  — diff preview; apply replaces only the selection; cancel changes nothing
Kanban task creation:       PASS  — dialog with AI title suggestion → task created
Kanban visual verification: PASS  — card visible in the triage column of the real board (screenshot)
Hermes restart:             PASS  — 2× full restart; plugin, tabs, language, contents present
Dark mode:                  PASS  — visually verified (Classic Hermes dark)
Light mode:                 PASS  — visually verified via native-theme.json themeSource "light" (2026-10-05)
Native dialogs:             PASS  — open + save-as driven through the real panels via AppleScript (2026-10-05)
Undo across restarts:       PASS  — history persisted in docStates; ⌘Z after a full app restart (2026-10-05)
```

### Notes on previously blocked items

- **Light mode**: the dev build initially ignored the "light" switch (Electron `native-theme.json` overrode the renderer store). The plugin uses only theme variables and adapts; visual confirmation was done later by setting `themeSource: "light"` directly (restored afterwards; note the app rewrites that file on quit).
- **Native dialogs** (⌘⌥O/⌘⌥⇧S): first considered not headlessly automatable; later driven end-to-end through the real panels via AppleScript keystrokes (⌘⇧G + typed path, /tmp targets only).

## Bugs found and fixed during testing

1. Editor did not mount when the page opened with no tab (ref-effect timing).
2. `extraKeys` keymap (⌘S/⌘K) was missing from the extension list.
3. Palette showed raw command ids instead of localized labels (key-mapping bug).
4. Restored file tabs stayed empty (lazy load missing on session restore).
5. Race: typing while the async file load was in flight clobbered user input.
6. Keybind conflicts: core owns ⌘⌥T, the bundled Kanban plugin owns ⌘⌥N → moved to ⌘⌥D (new) and ⌘⌥A (task).
7. Python plugin loader warnings → added `__init__.py` + no-op `register()`.

## Environment changes made during testing (documented, reversible)

- Both plugin halves installed (paths above); `hermes-scratchpad` in `plugins.enabled` (config.yaml).
- The connection was temporarily switched to the *local gateway* during provider testing; `connection.json` was restored to the original `remote` value afterwards.
- The bundled **Kanban desktop plugin was enabled** (previously off) — needed to see Scratchpad tasks on the board; can be disabled under Skills → Plugins.
- Test artifacts (a triage task, "Untitled" scratchpads, /tmp files) were left in the local environment on purpose; harmless and deletable.

## Build / install (exact commands)

```bash
npm install
npm run build           # esbuild → dist/plugin.js
npm run verify:bundle   # only @hermes/plugin-sdk, react, react/jsx-runtime
npm test                # unit tests
npm run typecheck
npm run install:local   # copies desktop + backend halves into ~/.hermes
# one-time: plugins.enabled in ~/.hermes/config.yaml must contain hermes-scratchpad
# one-time: restart the backend (app restart) so /api/plugins/hermes-scratchpad/ is mounted
```

## Addendum v0.2 (2026-10-04): tab-switch state + language overrides

1. **Undo history + cursor survive tab switches** — before every doc swap the
   EditorState is serialized (`state.toJSON({history: historyField})`) and
   restored on switch-back via `EditorState.fromJSON` (text match against the
   cached content guards against stale entries).
2. **Language override for file documents persisted** — `fileLanguages`
   (path → language) in PersistedState; `hydrate` applies it, `setDocLanguage`
   writes it, `openPath`/`saveAs` respect it.

Verified in the real app (CDP dev instance): text + selection identical after a
tab switch; ⌘Z after switching back and forth restored prior edits (previously:
history completely gone). The `python` override for a test file survived a
plugin hot reload (storage → hydrate → UI language selector showed "python",
editor content correct). 4 new unit tests (`tests/editor-state.test.ts`, store
hydrate test).

## Addendum v0.2 #2 (2026-10-05): search + snippet tags + word diff

Verified live in the real app (CDP dev instance, port 9333; plugin page
activated via `__HERMES_PLUGIN_SDK__.host.navigate`):

1. **Scratchpad search** — name: "kubernetes" → only "Kubernetes Notes"
   (recent-files section intentionally unfiltered). Content: "HTTP 429" → only
   the note containing that text. Escape clears the field, blurs, restores all
   entries.
2. **Snippet tags** — tags `web, api;; test ` saved → `["web","api","test"]`
   (trimmed, deduplicated). Searching "web" (only in a tag, not the title)
   finds the snippet in the Snippets section.
3. **Word-level diff** — a real `runAIAction('improve')` roundtrip against the
   configured gateway opened the preview; DOM: `.hsp-wseg[data-changed=true]`
   only on changed words, rest of the line only line-tinted. Screenshot:
   `/tmp/scratchpad-diff.png`. "Cancel" closed the dialog, document content
   byte-identical (safe-AI behavior confirmed).

## Addendum v0.2 #3 (2026-10-05): snippet management + file content search

1. **Snippet edit/delete** — ✎ button on every snippet entry (search matches +
   favorites) opens the edit dialog: title, tags (same `parseTags` rules) and
   favorite are prefilled and saveable. Delete is two-step ("Delete" → "Really
   delete?"), the first click does not delete. Verified: prefill, tag update
   via real UI input → `["web","api","test","cdplive"]` + toast + persisted,
   reverted to original, two-step delete (snippet survived the first click,
   gone after the second). The "no user-facing snippet delete" gap is closed.
2. **File content search** — the sidebar search now also matches files (open
   file tabs + recent files, deduplicated via `candidateFilePaths`). Contents
   of closed file tabs are read lazily through the backend (once per session,
   memoized in `$fileSearchContents`); name matching applies until the read
   lands. Verified: content term → "Files" section with the right file; name
   term → name hit; clicking the hit opened the file as the active tab with
   correct content (screenshots `/tmp/scratchpad-filesearch.png`,
   `/tmp/scratchpad-snippet-edit.png`).

New i18n keys (en/de in sync): `snippets.edit`, `snippets.editDialog`,
`snippets.delete`, `snippets.deleteConfirm`, `snippets.updated`,
`snippets.deleted`, `list.files`. 39 unit tests green.

## Addendum v0.2 #4 (2026-10-05): AI session config + alternate providers

1. **Dedicated AI session/persona** — the hidden session is now created with
   `source: 'hermes-scratchpad'`; optional agent-profile and model overrides
   (`session.create` params `profile`/`model`, verified against the gateway
   contract beforehand). An optional persona is prepended to every prompt
   (`composePrompt`, provider-independent). Profile/model changes reset the
   cached session (`resetHermesSession()`).
2. **Alternate providers** — `ollama.ts` (non-streaming `/api/chat`) and
   `openai.ts` (any OpenAI-compatible `/chat/completions`: OpenAI, LM Studio,
   vLLM, LiteLLM) implement the existing `AIProvider` interface; selection via
   `src/ai/registry.ts` (`providerFor`). HTTP runs — because of the page's
   opaque origin (CORS) — through the new backend route `/ai/proxy` (stdlib
   urllib, http/https only, 5–300 s timeout, 8 MB cap; HTTP error statuses are
   passed through as results, not plugin failures). **Note**: the proxy runs
   wherever the backend runs — with a remote connection that is the remote
   machine (`127.0.0.1` = remote machine).
3. **AI settings dialog** — ⚙ in the AI popup or palette "Scratchpad: AI
   Settings" (no keybind on purpose): provider select, persona textarea,
   provider-specific fields, "Test connection", save persists into
   `PersistedState.settings.ai` (merge over defaults, backward compatible).

**Live evidence**: OpenAI-compatible end-to-end against a local mock server
(`/v1/models` + `/v1/chat/completions`, bearer check): connection test "OK";
a real `improve` roundtrip returned `MOCK-OK model=mock-model sys=yes len=2`
in the preview — proof of the proxy route, auth header, model pass-through,
persona-as-system-message and the safe-AI preview path; "Cancel" left the
document byte-identical. Then back on the Hermes gateway with a persona: a
real roundtrip produced a proper improved note.
Screenshot: `/tmp/scratchpad-ai-openai.png`. 52 unit tests green.

## Addendum v0.2 #5 (2026-10-05): limitations sweep

1. **Undo history across app restarts** — `docStates` (selection + undo
   history serialized via `historyField`) are now persisted in PersistedState:
   folded into the debounced snapshot (dirty-driven, only the active document
   re-serialized), pruned to existing docs, 4 MB total cap, text-validated on
   restore (stale entries discard themselves). **Live evidence**: edit → full
   dev-app restart → content restored, docState with history loaded; a
   synthetic ⌘Z (`KeyboardEvent`, handled by CodeMirror —
   `defaultPrevented: true`) returned the document to its pre-edit state.
   Unit test: JSON stringify/parse roundtrip followed by `undo()` (green).
2. **Light mode visually verified** — `native-theme.json` temporarily set to
   `"light"`, dev instance started, screenshot of the full plugin page:
   `/tmp/scratchpad-lightmode.png` (sidebar, tab bar, editor, status bar all
   readable, no dark artifacts). File restored to `"system"` afterwards.
   Gotcha: the app appears to rewrite that file on quit.
3. **Native open/save dialogs driven end-to-end** — through the real panels
   (AppleScript keystrokes: ⌘⇧G + path, /tmp targets only): `scratchpad.open`
   opened a test file as the active file tab; `scratchpad.saveAs` created a new
   file on disk (content verified) and converted the scratch into a file tab.
   Note: the open panel resolves `/tmp` to `/private/tmp`.
4. **Ollama provider verified against a mock daemon** — mock `/api/tags` +
   `/api/chat` on 127.0.0.1:11434: "Test connection" → OK; a real `improve`
   roundtrip through the settings UI + backend proxy returned the mock echo
   (correctly without a system message for an empty persona).
   Screenshot: `/tmp/scratchpad-ai-ollama.png`. A real Ollama daemon was not
   installed — same code path.

54 unit tests green; AI settings reset to defaults, connection and theme files
restored, packaged app restarted. README brought to the v0.2 state.

## Addendum v0.2 #6 (2026-10-05): AI settings UX, per-action overrides/templates, verify script

1. **Profile suggestions** — the Hermes profile field in AI settings is fed
   by the `profiles.list` RPC (datalist; free text still allowed, a failed
   lookup simply leaves no suggestions). Live: datalist populated with the
   gateway's profile.
2. **Provider override + prompt templates per action** — every ⌘K action can
   override the global provider (`actionProviders`, '' = default) and define a
   custom prompt template (`templates`; placeholders `{{text}}`, `{{language}}`,
   `{{question}}`; empty = built-in prompt). Implementation: `providerForAction()`
   (registry), `buildActionPrompt()` (actions); dialog: select + textarea +
   ↺ reset per action. **Live evidence**: an echo template ("Reply with exactly
   this word…") → `improve` returned exactly `TEMPLATE-ECHO-OK` through the
   real gateway; overriding improve→openai (unreachable) produced the
   openai-unavailable error toast instead of a Hermes success — the override is
   genuinely used; ↺ reset the action. Screenshot:
   `/tmp/scratchpad-ai-settings-actions.png`.
3. **`scripts/verify-cdp.mjs`** — the previously hand-run checks as a
   repeatable, NON-destructive script (env / page / search / snippetEditDialog /
   aiSettingsDialog / shot; `--list`, individual names, default `all`). Runs
   against the CDP dev instance; dialogs are cancelled, the search is cleared,
   nothing is saved or deleted. First run: 6/6 PASS.

58 unit tests green; AI config reset to defaults; connection and theme files
restored; packaged app running again.

## Known issues / recommendations

- **Ollama**: the provider's logic is unit-tested and shares the live-verified
  proxy path, but has not been run against a real Ollama daemon (none
  installed on the test machine).
- **SDK limitation**: no cross-plugin REST and no Kanban RPC — hence the
  plugin's own backend half (requires `plugins.enabled` + one backend restart
  after installation; scripted in `install:local`).
- **Idea backlog**: listing Ollama models in the dialog (needs a reachable
  daemon), Save All, multi-window.
