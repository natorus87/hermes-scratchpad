/**
 * Plugin-scoped stylesheet. The disk plugin's classes are NOT compiled by the
 * app's Tailwind build, so the plugin ships its own small stylesheet (injected
 * at register, removed on dispose). Everything colors via Hermes theme
 * variables with safe fallbacks — no hardcoded colors.
 */
export const PLUGIN_CSS = `
.hsp-root { display: flex; height: 100%; min-height: 0; color: var(--foreground, inherit); font-size: 13px; }
.hsp-sidebar { width: 200px; flex: none; border-right: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25)); display: flex; flex-direction: column; overflow-y: auto; padding: 8px 0; }
.hsp-sidebar-collapsed { width: 0; overflow: hidden; border-right: none; }
.hsp-side-section { padding: 4px 10px 8px; }
.hsp-side-title { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ui-text-quaternary, rgba(127,127,127,.6)); margin: 8px 0 4px; display: flex; align-items: center; justify-content: space-between; }
.hsp-side-item { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 3px 6px; border-radius: 6px; border: none; background: transparent; color: var(--ui-text-secondary, inherit); cursor: pointer; font-size: 12px; }
.hsp-side-item:hover { background: var(--chrome-action-hover, rgba(127,127,127,.12)); color: var(--foreground, inherit); }
.hsp-side-item[data-active="true"] { background: var(--chrome-action-hover, rgba(127,127,127,.15)); color: var(--foreground, inherit); }
.hsp-rename-input { width: 100%; box-sizing: border-box; padding: 2px 6px; font-size: 12px; border-radius: 6px; border: 1px solid var(--ui-accent, rgba(127,127,127,.4)); background: transparent; color: var(--foreground, inherit); outline: none; }
.hsp-side-search { position: relative; margin: 2px 0 4px; }
.hsp-search-input { width: 100%; box-sizing: border-box; padding: 3px 20px 3px 6px; font-size: 12px; border-radius: 6px; border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); background: transparent; color: var(--foreground, inherit); outline: none; }
.hsp-search-input::placeholder { color: var(--ui-text-quaternary, rgba(127,127,127,.5)); }
.hsp-search-input:focus { border-color: var(--ui-accent, rgba(127,127,127,.5)); }
.hsp-search-clear { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); border: none; background: transparent; color: var(--ui-text-tertiary, rgba(127,127,127,.8)); cursor: pointer; padding: 1px 4px; border-radius: 4px; font-size: 10px; line-height: 1; }
.hsp-search-clear:hover { background: var(--chrome-action-hover, rgba(127,127,127,.2)); color: var(--foreground, inherit); }
.hsp-noresults { padding: 3px 6px; font-size: 11.5px; color: var(--ui-text-quaternary, rgba(127,127,127,.6)); }
.hsp-side-item span.hsp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hsp-side-row { display: flex; align-items: center; width: 100%; }
.hsp-side-row .hsp-side-item { flex: 1; min-width: 0; width: auto; }
.hsp-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.hsp-tabbar { display: flex; align-items: stretch; gap: 0; border-bottom: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25)); overflow-x: auto; flex: none; min-height: 30px; }
.hsp-tab { display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 12px; color: var(--ui-text-tertiary, rgba(127,127,127,.8)); border: none; background: transparent; border-right: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.15)); cursor: pointer; max-width: 200px; white-space: nowrap; }
.hsp-tab[data-active="true"] { color: var(--foreground, inherit); background: var(--chrome-action-hover, rgba(127,127,127,.1)); }
.hsp-tab .hsp-tab-name { overflow: hidden; text-overflow: ellipsis; }
.hsp-tab .hsp-dirty { width: 7px; height: 7px; border-radius: 50%; background: var(--ui-accent, currentColor); flex: none; }
.hsp-tab .hsp-close { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0 2px; border-radius: 4px; line-height: 1; }
.hsp-tab .hsp-close:hover { background: var(--chrome-action-hover, rgba(127,127,127,.2)); }
.hsp-tabbar-spacer { flex: 1; }
.hsp-tabbar-actions { display: flex; align-items: center; gap: 2px; padding: 0 6px; }
.hsp-iconbtn { border: none; background: transparent; color: var(--ui-text-tertiary, rgba(127,127,127,.8)); cursor: pointer; padding: 3px 6px; border-radius: 6px; font-size: 12px; line-height: 1; }
.hsp-iconbtn:hover { background: var(--chrome-action-hover, rgba(127,127,127,.12)); color: var(--foreground, inherit); }
.hsp-editor-host { flex: 1; min-height: 0; position: relative; }
.hsp-editor-host .cm-editor { position: absolute; inset: 0; }
.hsp-statusbar { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25)); padding: 2px 10px; font-size: 11px; color: var(--ui-text-quaternary, rgba(127,127,127,.6)); flex: none; min-height: 24px; }
.hsp-statusbar .hsp-grow { flex: 1; }
.hsp-statusbar select { background: transparent; color: inherit; border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25)); border-radius: 5px; font-size: 11px; padding: 0 2px; }
.hsp-ai-popup { position: absolute; top: 8px; right: 16px; z-index: 30; width: 260px; background: var(--ui-surface, var(--background, #1e1e1e)); border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.35); padding: 8px; }
.hsp-ai-popup .hsp-ai-title { font-size: 11px; color: var(--ui-text-tertiary, rgba(127,127,127,.8)); margin-bottom: 6px; }
.hsp-ai-popup .hsp-ai-title-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.hsp-ai-popup .hsp-ai-title-row .hsp-ai-title { margin-bottom: 0; flex: 1; }
.hsp-ai-test { font-size: 12px; margin: 2px 0 6px; }
.hsp-ai-test[data-ok='true'] { color: var(--ui-success, var(--foreground, inherit)); }
.hsp-ai-test[data-ok='false'] { color: var(--ui-danger, var(--foreground, inherit)); }
.hsp-action-row { padding: 2px 0 4px; border-bottom: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.12)); }
.hsp-action-head { display: flex; align-items: center; gap: 6px; }
.hsp-action-name { flex: 1; font-size: 12px; color: var(--ui-text-secondary, inherit); }
.hsp-action-provider { width: auto !important; flex: none; font-size: 11px; padding: 2px 4px !important; }
.hsp-action-template { min-height: 0 !important; font-size: 11.5px !important; }
.hsp-ai-actions { display: flex; flex-direction: column; gap: 1px; }
.hsp-ai-action { display: flex; width: 100%; align-items: center; gap: 6px; padding: 4px 8px; border: none; border-radius: 6px; background: transparent; color: var(--ui-text-secondary, inherit); font-size: 12px; cursor: pointer; text-align: left; }
.hsp-ai-action:hover { background: var(--chrome-action-hover, rgba(127,127,127,.14)); color: var(--foreground, inherit); }
.hsp-ai-input { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 5px 8px; font-size: 12px; border-radius: 7px; border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); background: transparent; color: var(--foreground, inherit); }
.hsp-ai-input::placeholder { color: var(--ui-text-quaternary, rgba(127,127,127,.5)); }
.hsp-dialog-scrim { position: absolute; inset: 0; z-index: 40; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; }
.hsp-dialog { width: min(720px, 86%); max-height: 84%; display: flex; flex-direction: column; background: var(--ui-surface, var(--background, #1e1e1e)); border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.4); padding: 14px; }
.hsp-dialog h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.hsp-dialog .hsp-formrow { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; }
.hsp-dialog label { font-size: 11px; color: var(--ui-text-tertiary, rgba(127,127,127,.8)); }
.hsp-dialog input, .hsp-dialog textarea, .hsp-dialog select { width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); background: transparent; color: var(--foreground, inherit); font-family: inherit; }
.hsp-dialog textarea { font-family: ui-monospace, Menlo, monospace; resize: vertical; min-height: 110px; }
.hsp-dialog .hsp-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; flex-wrap: wrap; }
.hsp-btn { border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35)); background: transparent; color: var(--foreground, inherit); border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.hsp-btn:hover { background: var(--chrome-action-hover, rgba(127,127,127,.14)); }
.hsp-btn[data-primary="true"] { background: var(--ui-accent, var(--foreground)); border-color: transparent; color: var(--ui-accent-contrast, #fff); }
.hsp-btn[data-primary="true"]:hover { filter: brightness(1.08); }
.hsp-btn:disabled { opacity: .5; cursor: default; }
.hsp-preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 0; flex: 1; overflow: hidden; }
.hsp-preview-pane { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25)); border-radius: 8px; overflow: hidden; }
.hsp-preview-pane .hsp-pane-label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 4px 8px; color: var(--ui-text-quaternary, rgba(127,127,127,.6)); border-bottom: 1px solid var(--ui-stroke-secondary, rgba(127,127,127,.15)); }
.hsp-preview-pane pre { margin: 0; padding: 8px; overflow: auto; font-size: 11.5px; line-height: 1.45; font-family: ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-word; flex: 1; }
.hsp-preview-pane pre[data-lines] { padding: 0; }
.hsp-diff-line { display: block; padding: 0 8px; }
.hsp-diff-line[data-kind="same"] { color: var(--ui-text-secondary, inherit); }
.hsp-diff-line[data-kind="add"] { background: var(--ui-diff-add, rgba(80,200,120,.18)); }
.hsp-diff-line[data-kind="del"] { background: var(--ui-diff-del, rgba(230,90,90,.16)); text-decoration: line-through; text-decoration-color: rgba(230,90,90,.4); }
.hsp-wseg { border-radius: 2px; }
.hsp-diff-line[data-kind="add"] .hsp-wseg[data-changed="true"] { background: var(--ui-diff-add-strong, rgba(80,200,120,.34)); }
.hsp-diff-line[data-kind="del"] .hsp-wseg[data-changed="true"] { background: var(--ui-diff-del-strong, rgba(230,90,90,.36)); }
.hsp-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--ui-stroke-secondary, rgba(127,127,127,.4)); border-top-color: var(--ui-accent, currentColor); border-radius: 50%; animation: hsp-rotate 0.9s linear infinite; }
@keyframes hsp-rotate { to { transform: rotate(360deg); } }
.hsp-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ui-text-quaternary, rgba(127,127,127,.6)); font-size: 13px; white-space: pre-line; text-align: center; padding: 24px; }
`
