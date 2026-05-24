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
    "pre_api_request",
    "post_api_request",
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


def _safe_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


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


def _request_messages(payload: dict[str, Any]) -> list[Any]:
    messages = payload.get("request_messages")
    if messages is None:
        messages = payload.get("messages")
    return messages if isinstance(messages, list) else []


def _request_tools(payload: dict[str, Any]) -> list[Any]:
    tools = payload.get("request_tools")
    if tools is None:
        tools = payload.get("tools")
    if tools is None and isinstance(payload.get("api_kwargs"), dict):
        tools = payload["api_kwargs"].get("tools")
    return tools if isinstance(tools, list) else []


def _message_role(message: Any) -> Optional[str]:
    if not isinstance(message, dict):
        return None
    role = message.get("role")
    return role if isinstance(role, str) else None


def _system_prompt_hash(messages: list[Any]) -> Optional[str]:
    system_messages = [
        message for message in messages
        if _message_role(message) in {"system", "developer", "instructions"}
    ]
    return _stable_hash(system_messages) if system_messages else None


def _tool_schema_hash(tools: list[Any]) -> Optional[str]:
    return _stable_hash(tools) if tools else None


def _tool_result_error_count(messages: list[Any]) -> int:
    count = 0
    for message in messages:
        if not isinstance(message, dict) or _message_role(message) != "tool":
            continue
        status = str(message.get("status") or "").strip().lower()
        if status in {"error", "failed", "errored"} or message.get("error") is not None:
            count += 1
    return count


def _context_byte_size(payload: dict[str, Any], messages: list[Any]) -> int:
    configured = _safe_int(payload.get("request_char_count"))
    if configured is not None:
        return configured
    redacted_shape = [
        {
            "role": _message_role(message),
            "keys": sorted(str(key) for key in message.keys()) if isinstance(message, dict) else [],
        }
        for message in messages
    ]
    return len(json.dumps(redacted_shape, sort_keys=True, ensure_ascii=True).encode("utf-8"))


def _usage_value(usage: Any, *paths: tuple[str, ...]) -> Optional[int]:
    if not isinstance(usage, dict):
        return None
    for keys in paths:
        value: Any = usage
        for key in keys:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(key)
        number = _safe_int(value)
        if number is not None:
            return number
    return None


def _model_io_tap_event(hook: str, payload: dict[str, Any]) -> dict[str, Any]:
    messages = _request_messages(payload)
    tools = _request_tools(payload)
    usage = payload.get("usage")
    api_call_count = _safe_int(payload.get("api_call_count"))
    system_hash = _system_prompt_hash(messages)
    tool_hash = _tool_schema_hash(tools)
    context_size = _context_byte_size(payload, messages)
    tool_errors = _tool_result_error_count(messages)
    source_hash = _stable_hash({
        'session_id': payload.get('session_id'),
        'task_id': payload.get('task_id'),
        'api_call_count': api_call_count,
        'hook': hook,
        'message_count': payload.get('message_count'),
        'tool_count': payload.get('tool_count'),
        'context_byte_size': context_size,
        'system_prompt_hash': system_hash,
        'tool_schema_hash': tool_hash,
        'usage': usage,
    })
    source_id = f"hermes-{hook}-{source_hash[:12]}"
    input_tokens = _safe_int(payload.get("approx_input_tokens"))
    if input_tokens is None:
        input_tokens = _usage_value(
            usage,
            ("input_tokens",),
            ("prompt_tokens",),
            ("usage", "input_tokens"),
            ("usage", "prompt_tokens"),
        )
    record = {
        "schema_version": "misa.hermes_runtime_event.v1",
        "event_id": source_id,
        "record_id": f"hermes-model-io-tap-{_stable_hash(source_id)[:12]}",
        "record_kind": "model_io_tap",
        "source_event_ids": [source_id],
        "hook": hook,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "task_id": payload.get("task_id"),
        "signal_origin": "runtime_operation_log",
        "routing_stream": "observability_stream",
        "stream_reason": "readonly model I/O digest; input-side observability only",
        "status": "observed",
        "replay_required": False,
        "tournament_required": False,
        "can_promote_now": False,
        "advisory_only": True,
        "anomaly_rule_version": "none",
        "anomaly_rule_ids": [],
        "raw_prompt_persisted": False,
        "raw_private_content_exported": False,
        "redaction_status": "at_tap_point",
        "source_contract": {
            "kind": "deterministic_reducer",
            "llm_api_calls": 0,
        },
        "api_call_ref": {
            "session_id": payload.get("session_id") if isinstance(payload.get("session_id"), str) else None,
            "task_id": payload.get("task_id") if isinstance(payload.get("task_id"), str) else None,
            "api_call_count": api_call_count,
            "hook": hook,
            "model": payload.get("model") if isinstance(payload.get("model"), str) else None,
            "provider": payload.get("provider") if isinstance(payload.get("provider"), str) else None,
            "api_mode": payload.get("api_mode") if isinstance(payload.get("api_mode"), str) else None,
            "base_url_hash": _stable_hash(payload.get("base_url")) if payload.get("base_url") else None,
        },
        "metrics": {
            "token_usage": {
                "input_tokens": input_tokens,
                "output_tokens": _usage_value(
                    usage,
                    ("output_tokens",),
                    ("completion_tokens",),
                    ("usage", "output_tokens"),
                    ("usage", "completion_tokens"),
                ),
                "cache_read_tokens": _usage_value(
                    usage,
                    ("cache_read_input_tokens",),
                    ("prompt_tokens_details", "cached_tokens"),
                    ("input_token_details", "cache_read"),
                    ("usage", "cache_read_input_tokens"),
                ),
            },
            "message_count": _safe_int(payload.get("message_count")) or len(messages),
            "context_byte_size": context_size,
            "tool_schema_count": _safe_int(payload.get("tool_count")) or len(tools),
            "tool_result_error_count": tool_errors,
            "system_prompt_hash": system_hash,
            "tool_schema_hash": tool_hash,
        },
        "source_window": {
            "kind": "count",
            "value": "1_model_io_tap_events",
        },
        "source_refs": ["qianxuesen-hermes-runtime-plugin"],
        "observed_only": True,
        "contains_raw_private_content": False,
        "qianxuesen_default_mode": "observe_only",
    }
    return record


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
    event = _model_io_tap_event(hook, payload) if hook in {"pre_api_request", "post_api_request"} else _event(hook, payload)
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
