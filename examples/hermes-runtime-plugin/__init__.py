"""Observe-only Hermes plugin skeleton for the Qianxuesen runtime adapter.

This file is intentionally small. It proves the plug shape: Hermes owns hook
delivery, Qianxuesen owns downstream learning decisions.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


HOOKS = (
    "pre_tool_call",
    "post_tool_call",
    "pre_llm_call",
    "post_llm_call",
    "on_session_end",
)


def _default_log_path() -> Path:
    return Path.home() / ".hermes" / "qianxuesen-runtime-events.ndjson"


def _log_path() -> Path:
    configured = os.getenv("QIANXUESEN_HERMES_EVENT_LOG", "").strip()
    return Path(configured).expanduser() if configured else _default_log_path()


def _stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _safe_args(args: Any) -> dict[str, Any]:
    if not isinstance(args, dict):
        return {"action": None, "keys": [], "fingerprint": _stable_hash(args)}
    return {
        "action": args.get("action"),
        "keys": sorted(str(key) for key in args.keys()),
        "name": args.get("name") if isinstance(args.get("name"), str) else None,
        "target": args.get("target") if isinstance(args.get("target"), str) else None,
        "fingerprint": _stable_hash(args),
    }


def _safe_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return sorted(str(item) for item in value if item is not None)


def _safe_context(context: Any) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}
    return {
        "platform": context.get("platform") if isinstance(context.get("platform"), str) else None,
        "curator_action": context.get("curator_action") if isinstance(context.get("curator_action"), str) else None,
        "skill_name": context.get("skill_name") if isinstance(context.get("skill_name"), str) else None,
        "terms": _safe_list(context.get("terms")),
        "signals": _safe_list(context.get("signals")),
        "conversation_signals": _safe_list(context.get("conversation_signals")),
        "evidence_refs": _safe_list(context.get("evidence_refs")),
        "fingerprint": _stable_hash(context),
    }


def _safe_result(result: Any) -> Optional[dict[str, Any]]:
    if result is None:
        return None
    if not isinstance(result, dict):
        return {"status": None, "success": None, "fingerprint": _stable_hash(result)}
    return {
        "status": result.get("status") if isinstance(result.get("status"), str) else None,
        "success": result.get("success") if isinstance(result.get("success"), bool) else None,
        "keys": sorted(str(key) for key in result.keys()),
        "fingerprint": _stable_hash(result),
    }


def _event(hook: str, payload: dict[str, Any]) -> dict[str, Any]:
    tool_name = payload.get("tool_name")
    args = _safe_args(payload.get("args"))
    return {
        "schema_version": "misa.hermes_runtime_event.v1",
        "event_id": f"hermes-{hook}-{_stable_hash(payload)[:12]}",
        "hook": hook,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "task_id": payload.get("task_id"),
        "tool_call_id": payload.get("tool_call_id"),
        "tool_name": tool_name,
        "args": args,
        "context": _safe_context(payload.get("context")),
        "result": _safe_result(payload.get("result")),
        "source_refs": ["qianxuesen-hermes-runtime-plugin"],
        "observed_only": True,
        "contains_raw_private_content": False,
        "qianxuesen_default_mode": "observe_only",
    }


def _emit(hook: str, **payload: Any) -> None:
    event = _event(hook, payload)
    path = _log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=True, sort_keys=True) + "\n")


def _make_hook(hook: str):
    def handler(**kwargs: Any):
        _emit(hook, **kwargs)
        return None

    return handler


def register(ctx) -> None:
    for hook in HOOKS:
        ctx.register_hook(hook, _make_hook(hook))
