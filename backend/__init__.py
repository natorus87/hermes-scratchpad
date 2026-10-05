"""Hermes Scratchpad — agent-side half.

This plugin is UI-first: the desktop half (Hermes Scratchpad editor) lives in
``$HERMES_HOME/desktop-plugins/hermes-scratchpad/plugin.js`` and the backend
API (Kanban task creation + local file IO) is the FastAPI router in
``dashboard/plugin_api.py``, mounted at ``/api/plugins/hermes-scratchpad/``.

No agent-side hooks are needed, so ``register()`` is a no-op.
"""


def register(ctx) -> None:  # noqa: ANN001 — hermes plugin ctx
    return None
