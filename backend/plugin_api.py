"""Hermes Scratchpad backend — mounted at /api/plugins/hermes-scratchpad/.

Two responsibilities:
1. Kanban task creation. Every handler is a thin wrapper around
   ``hermes_cli.kanban_db`` — the same code path the official Kanban
   dashboard plugin, the CLI and the dispatcher use, so nothing here writes
   the database directly.
2. File read/write for the editor's File Documents (size-capped, atomic
   writes via tempfile + os.replace). Plain local text files only.

Failures return {"ok": false, "error": ...}; the editor never depends on a
Kanban or filesystem success for its own content.
"""

from __future__ import annotations

import logging
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter()

MAX_TEXT_BYTES = 8 * 1024 * 1024
MAX_PROXY_RESPONSE_BYTES = 8 * 1024 * 1024
PROXY_TIMEOUT_MIN_S = 5
PROXY_TIMEOUT_MAX_S = 300


class ReadBody(BaseModel):
    path: str


class WriteBody(BaseModel):
    path: str
    content: str


class CreateTaskBody(BaseModel):
    title: str
    body: str = ""
    board: Optional[str] = None
    priority: int = 0


def _err(message: str, status_hint: str = "") -> dict[str, Any]:
    return {"ok": False, "error": f"{message}{' — ' + status_hint if status_hint else ''}"}


def _kanban_conn(board: Optional[str]):
    """A kanban.db connection for *board* (None = the current board). init_db is
    idempotent; running it here lets a fresh install self-heal."""
    from hermes_cli import kanban_db, kanban_db_connect as kbc

    try:
        kanban_db.init_db(board=board)
    except Exception as exc:  # noqa: BLE001
        log.warning("kanban init_db failed: %s", exc)
    return kbc.connect(board=board)


@router.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "plugin": "hermes-scratchpad"}


# --- boards -----------------------------------------------------------------


@router.get("/boards")
def list_boards() -> dict[str, Any]:
    try:
        from hermes_cli import kanban_db

        boards = kanban_db.list_boards(include_archived=False)
        current = kanban_db.get_current_board()
        return {
            "ok": True,
            "boards": [
                {"slug": b["slug"], "name": b.get("name") or b["slug"], "current": b["slug"] == current}
                for b in boards
            ],
        }
    except Exception as exc:  # noqa: BLE001 — surface as ok:false, never crash the page
        log.warning("scratchpad boards unavailable: %s", exc)
        return _err("boards unavailable", str(exc))


# --- tasks ------------------------------------------------------------------


@router.post("/tasks")
def create_task(payload: CreateTaskBody) -> dict[str, Any]:
    """Create a task parked in the *triage* lane — created-from-a-note tasks must
    never auto-dispatch to a worker; the user moves them from the board."""
    if not payload.title.strip():
        return _err("title required")
    conn = None
    try:
        from hermes_cli import kanban_db

        conn = _kanban_conn(payload.board)
        task_id = kanban_db.create_task(
            conn,
            created_by="hermes-scratchpad",
            board=payload.board,
            title=payload.title.strip(),
            body=payload.body or None,
            priority=payload.priority,
            triage=True,
        )
        task = kanban_db.get_task(conn, task_id)
        return {
            "ok": True,
            "task": {
                "id": task.id,
                "key": getattr(task, "key", None) or task.id,
                "title": task.title,
                "status": task.status,
                "board": payload.board or kanban_db.DEFAULT_BOARD,
            },
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("scratchpad task create failed: %s", exc)
        return _err("task could not be created", str(exc))
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


# --- ai provider proxy ------------------------------------------------------


class ProxyBody(BaseModel):
    url: str
    method: str = "GET"
    headers: dict[str, str] = {}
    body: Optional[str] = None
    timeout_ms: int = 120_000


@router.post("/ai/proxy")
def ai_proxy(payload: ProxyBody) -> dict[str, Any]:
    """Server-side HTTP proxy for alternate AI providers (Ollama /
    OpenAI-compatible). The desktop page runs on an opaque origin, so it
    cannot call those HTTP APIs directly (CORS) — the backend does it for it.
    http/https only, timeout- and size-capped; no credentials are stored."""
    parsed = urlparse(payload.url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return _err("only absolute http/https urls are allowed")
    timeout_s = max(PROXY_TIMEOUT_MIN_S, min(PROXY_TIMEOUT_MAX_S, payload.timeout_ms // 1000))
    data = payload.body.encode("utf-8") if payload.body is not None else None
    request = urllib.request.Request(payload.url, data=data, method=payload.method.upper())
    for name, value in payload.headers.items():
        if name.lower() in ("host", "content-length"):
            continue
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            raw = response.read(MAX_PROXY_RESPONSE_BYTES + 1)
            if len(raw) > MAX_PROXY_RESPONSE_BYTES:
                return _err("response too large")
            return {"ok": True, "status": response.status, "body": raw.decode("utf-8", errors="replace")}
    except urllib.error.HTTPError as exc:
        # An HTTP error status is a valid proxy result, not a plugin failure —
        # the provider layer decides what to do with it.
        try:
            raw = exc.read(MAX_PROXY_RESPONSE_BYTES + 1)
        except Exception:  # noqa: BLE001
            raw = b""
        if len(raw) > MAX_PROXY_RESPONSE_BYTES:
            return _err("response too large")
        return {"ok": True, "status": exc.code, "body": raw.decode("utf-8", errors="replace")}
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log.info("scratchpad ai proxy failed: %s", exc)
        return _err("request failed", str(exc))


# --- files ------------------------------------------------------------------


@router.post("/fs/read")
def read_file(payload: ReadBody) -> dict[str, Any]:
    path = Path(payload.path).expanduser()
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        return _err("file not found", str(exc))
    if not resolved.is_file():
        return _err("not a file")
    try:
        size = resolved.stat().st_size
        if size > MAX_TEXT_BYTES:
            return _err("file too large", f"{size} bytes")
        content = resolved.read_text(encoding="utf-8", errors="strict")
    except (OSError, UnicodeDecodeError) as exc:
        return _err("file could not be read as UTF-8 text", str(exc))
    return {"ok": True, "path": str(resolved), "content": content}


@router.post("/fs/write")
def write_file(payload: WriteBody) -> dict[str, Any]:
    path = Path(payload.path).expanduser()
    resolved = path.resolve()
    try:
        size = len(payload.content.encode("utf-8"))
        if size > MAX_TEXT_BYTES:
            return _err("file too large", f"{size} bytes")
        parent = resolved.parent
        if not parent.is_dir():
            return _err("parent directory does not exist")
        # Atomic write: tempfile in the same directory, fsync, rename over.
        fd, tmp = tempfile.mkstemp(dir=str(parent), prefix=f".{resolved.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload.content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, resolved)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    except OSError as exc:
        return _err("file could not be written", str(exc))
    return {"ok": True, "path": str(resolved)}
