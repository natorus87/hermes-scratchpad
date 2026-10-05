# Development notes

Practical knowledge from building and verifying this plugin against a real
Hermes Desktop install. See `AGENTS.md` for the hard constraints and
`docs/SDK-NOTES.md` for why the architecture looks the way it does.

## Quick re-verification (after any change)

```bash
npm run typecheck && npm test && npm run build && npm run verify:bundle
npm run install:local   # copies both halves into ~/.hermes; desktop half hot-reloads
# then in the running app: sidebar → Scratchpad; ⌘K → "Scratchpad: …"
```

If the plugin fails to load: check `~/.hermes/logs/desktop.log` for
`[error-boundary:contrib:plugin:hermes-scratchpad:...]`; the loader also shows
a toast naming the error. Backend routes 404 → check `plugins.enabled` in
`~/.hermes/config.yaml` + restart the backend (app restart).

## Real-app verification via CDP

A CDP-visible dev instance is needed (the packaged app never opens CDP):

```bash
# quit the packaged app first (single-instance lock)
cd ~/.hermes/hermes-agent/apps/desktop && HERMES_DESKTOP_CDP_PORT=9333 npm run dev
```

- The plugin page is NOT mounted until visited — activate it via
  `window.__HERMES_PLUGIN_SDK__.host.navigate('/scratchpad')`.
- `window.__hermesScratchpad` exposes the controller in the renderer.
- `scripts/cdp.mjs` offers `eval` / `shot` / `nav` / `console`.

**`scripts/verify-cdp.mjs`** automates the recurring smoke checks
(`env`, `page`, `search`, `snippetEditDialog`, `aiSettingsDialog`, `shot`) —
non-destructive: dialogs are cancelled, the search is cleared, nothing is
saved or deleted. `node scripts/verify-cdp.mjs --list` lists them.

Gotchas learned the hard way (all previously fixed, do not regress):

- The editor host div must exist before `attachEditor` runs (empty-state
  swap-in breaks the ref effect) — see the `hostEl` state in `src/ui/page.tsx`.
- `options.extraKeys` must be spread into the extension list in
  `src/editor/setup.ts` or ⌘S/⌘K silently die.
- Palette labels: command id `scratchpad.x` → i18n key `command.x`
  (`labelOf()` in `src/plugin/index.ts`).
- File tab restore needs the lazy `loadFileInto` on attach AND activate
  (the early-return guard must check the text cache, not just the active id).
- Async file load must never clobber text typed while the read was in flight
  (`loadFileInto` "edited" guard).
- `swapDoc` has a same-doc path (async file load landed): it must NOT restore
  a cached docState there (the entry is stale once content came from disk).
- CDP evals share one global context across calls: use IIFEs, not top-level
  `const`. React renders asynchronously — a dialog opened in the same eval
  tick is not yet in the DOM; check it in a separate eval.
- To drive React controlled inputs, set the value via the native prototype
  setter and dispatch an `input` event.

## Testing notes

- The desktop's active gateway (local or remote) decides WHICH machine's
  filesystem the backend `/fs/*` and `/ai/proxy` routes touch — remote mode
  means `127.0.0.1` is the remote machine. Keep this in mind for tests.
- Provider tests against mock servers (OpenAI-compatible on :8765, Ollama
  on :11434) are a quick way to exercise the full chain without real
  credentials; the connection mode must be `local` for the backend to reach
  them.
- The app appears to rewrite `~/.hermes/native-theme.json` on quit (mirror of
  its internal themeSource) — a hand-edited value can be overwritten by the
  next app quit.
- Light/dark: the plugin renders purely through Hermes theme variables
  (`--ui-*`, `--foreground`, `--chrome-action-hover`, …) with safe fallbacks;
  both modes were verified visually.
