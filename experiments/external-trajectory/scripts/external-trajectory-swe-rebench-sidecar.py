#!/usr/bin/env python
"""Build a sanitized SWE-rebench JSONL sidecar from the local parquet file.

The output intentionally keeps only compact counters and public benchmark ids.
It does not persist trajectory text, tool arguments, model patches, or raw logs.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq


DEFAULT_PARQUET = Path(r"F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\trajectories.parquet")
DEFAULT_OUTPUT = Path(r"F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.jsonl")

RISK_PATTERNS = {
    "destructive": re.compile(r"\b(rm\s+-rf|rm\s+-r|sudo|chmod\s+-R|chown\s+-R|mkfs)\b", re.I),
    "install_or_network": re.compile(r"\b((pip|pip3|npm|pnpm|yarn|apt|apt-get|brew)\s+install|curl|wget)\b", re.I),
    "git_push_or_publish": re.compile(r"\b(git\s+push|gh\s+release|npm\s+publish)\b", re.I),
}

NON_RISK_COMMAND_PATTERNS = {
    "git_commit": re.compile(r"\bgit\s+commit\b", re.I),
    "test_or_verify": re.compile(r"\b(pytest|npm\s+test|pnpm\s+test|yarn\s+test|go\s+test|cargo\s+test)\b", re.I),
}
SIDE_CAR_COLUMNS = [
    "instance_id",
    "trajectory",
    "resolved",
]


def bool_or_none(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "pass", "passed", "resolved", "success"}:
        return True
    if text in {"0", "false", "no", "fail", "failed", "unresolved", "failure"}:
        return False
    return None


def parse_args(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def count_patterns(text: str, patterns: dict[str, re.Pattern[str]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    if not text:
        return counts
    for name, pattern in patterns.items():
        count = len(pattern.findall(text))
        if count:
            counts[name] += count
    return counts


def tool_call_command(tool_call: dict[str, Any]) -> str:
    function = tool_call.get("function") or {}
    args = parse_args(function.get("arguments"))
    for key in ("command", "cmd", "shell_command"):
        value = args.get(key)
        if isinstance(value, str):
            return value
    return ""


def compact_contexts(context_counts: Counter[tuple[str, str]]) -> str:
    if not context_counts:
        return "none"
    parts = [
        f"{pattern}.{context}:{count}"
        for (pattern, context), count in sorted(context_counts.items())
        if count > 0
    ]
    return "|".join(parts) if parts else "none"


def summarize_trajectory(trajectory: list[dict[str, Any]]) -> dict[str, Any]:
    actual_risk = 0
    non_actual_risk = 0
    context_counts: Counter[tuple[str, str]] = Counter()
    tool_call_count = 0

    for message in trajectory or []:
        role = str(message.get("role") or "unknown").lower()
        content = message.get("content")
        content_text = content if isinstance(content, str) else ""

        for tool_call in message.get("tool_calls") or []:
            tool_call_count += 1
            command = tool_call_command(tool_call)
            risk_counts = count_patterns(command, RISK_PATTERNS)
            non_risk_counts = count_patterns(command, NON_RISK_COMMAND_PATTERNS)
            for pattern_name, count in risk_counts.items():
                actual_risk += count
                context_counts[(pattern_name, "actual_command")] += count
            for pattern_name, count in non_risk_counts.items():
                context_counts[(pattern_name, "actual_command")] += count

        if content_text:
            context = "tool_result_output" if role == "tool" else "plan_or_instruction"
            risk_counts = count_patterns(content_text, RISK_PATTERNS)
            non_risk_counts = count_patterns(content_text, NON_RISK_COMMAND_PATTERNS)
            for pattern_name, count in risk_counts.items():
                non_actual_risk += count
                context_counts[(pattern_name, context)] += count
            for pattern_name, count in non_risk_counts.items():
                context_counts[(pattern_name, context)] += count

    return {
        "actual_risk_keyword_count": actual_risk,
        "non_actual_risk_keyword_count": non_actual_risk,
        "raw_risk_keyword_count": actual_risk + non_actual_risk,
        "tool_call_count": tool_call_count,
        "action_count": len(trajectory or []),
        "command_contexts": compact_contexts(context_counts),
    }


def bucket_for(item: dict[str, Any]) -> str:
    resolved = item.get("resolved")
    outcome = "resolved_true" if resolved is True else "resolved_false" if resolved is False else "resolved_unknown"
    if item["actual_risk_keyword_count"] > 0:
        return f"actual_risk_{outcome}"
    if item["non_actual_risk_keyword_count"] > 0:
        return f"non_actual_only_{outcome}"
    if item["tool_call_count"] > 0:
        return f"command_context_no_risk_{outcome}"
    return f"neutral_{outcome}"


def sanitized_row(row: dict[str, Any], *, row_group: int | None = None, row_index: int | None = None) -> dict[str, Any]:
    trajectory = row.get("trajectory") or []
    resolved = bool_or_none(row.get("resolved"))
    summary = summarize_trajectory(trajectory)
    item = {
        "instance_id": row.get("instance_id"),
        "resolved": resolved,
        "success": resolved,
        "confidence": "medium" if resolved is not None else "weak",
        "suggestion_count": max(summary["tool_call_count"], summary["action_count"], 1),
        "action_count": summary["action_count"],
        "tool_call_count": summary["tool_call_count"],
        "adopted_count": 1 if resolved is True else 0,
        "rejected_count": 1 if resolved is False else 0,
        "raw_risk_keyword_count": summary["raw_risk_keyword_count"],
        "actual_risk_keyword_count": summary["actual_risk_keyword_count"],
        "non_actual_risk_keyword_count": summary["non_actual_risk_keyword_count"],
        "command_contexts": summary["command_contexts"],
    }
    item["stratified_bucket"] = bucket_for(item)
    if row_group is not None:
        item["source_row_group"] = row_group
    if row_index is not None:
        item["source_row_index"] = row_index
    return item


def update_diagnostics(diagnostics: Counter[str], item: dict[str, Any]) -> None:
    diagnostics["scanned_rows"] += 1
    diagnostics[f"bucket:{item['stratified_bucket']}"] += 1
    if item["actual_risk_keyword_count"] > 0:
        diagnostics["actual_risk_rows"] += 1
    if item["non_actual_risk_keyword_count"] > 0 and item["actual_risk_keyword_count"] == 0:
        diagnostics["non_actual_only_rows"] += 1
    if item["resolved"] is True:
        diagnostics["resolved_true_rows"] += 1
    if item["resolved"] is False:
        diagnostics["resolved_false_rows"] += 1


def evenly_spaced(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or len(items) <= limit:
        return list(items)
    if limit == 1:
        return [items[0]]
    selected: list[dict[str, Any]] = []
    used: set[int] = set()
    step = (len(items) - 1) / max(limit - 1, 1)
    for index in range(limit):
        source_index = round(index * step)
        if source_index not in used:
            selected.append(items[source_index])
            used.add(source_index)
    return selected


def stratified_select(rows: list[dict[str, Any]], sample_size: int) -> list[dict[str, Any]]:
    if sample_size <= 0 or len(rows) <= sample_size:
        return rows
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in rows:
        buckets.setdefault(item["stratified_bucket"], []).append(item)

    bucket_names = sorted(buckets)
    base = max(1, sample_size // max(len(bucket_names), 1))
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()

    for bucket_name in bucket_names:
        for item in evenly_spaced(buckets[bucket_name], base):
            key = str(item.get("instance_id"))
            if key not in selected_ids and len(selected) < sample_size:
                selected.append(item)
                selected_ids.add(key)

    cursor = 0
    while len(selected) < sample_size and cursor < len(bucket_names) * 2:
        bucket_name = bucket_names[cursor % len(bucket_names)]
        for item in evenly_spaced(buckets[bucket_name], sample_size):
            key = str(item.get("instance_id"))
            if key not in selected_ids:
                selected.append(item)
                selected_ids.add(key)
                break
        cursor += 1

    if len(selected) < sample_size:
        for item in rows:
            key = str(item.get("instance_id"))
            if key not in selected_ids:
                selected.append(item)
                selected_ids.add(key)
                if len(selected) >= sample_size:
                    break

    return sorted(selected[:sample_size], key=lambda item: (item.get("source_row_group", 0), item.get("source_row_index", 0)))


def collect_rows(parquet: pq.ParquetFile, args: argparse.Namespace, diagnostics: Counter[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    scanned = 0
    absolute_index = 0

    for group_index in range(parquet.num_row_groups):
        rows_from_group = 0
        for batch in parquet.iter_batches(
            batch_size=args.batch_size,
            row_groups=[group_index],
            columns=SIDE_CAR_COLUMNS,
        ):
            for row in batch.to_pylist():
                if args.max_rows_per_row_group and rows_from_group >= args.max_rows_per_row_group:
                    break
                item = sanitized_row(row, row_group=group_index, row_index=absolute_index)
                rows.append(item)
                update_diagnostics(diagnostics, item)
                scanned += 1
                rows_from_group += 1
                absolute_index += 1
                if args.scan_limit and scanned >= args.scan_limit:
                    return rows
                if args.sampling_profile == "head" and args.limit and len(rows) >= args.limit:
                    return rows
            if args.max_rows_per_row_group and rows_from_group >= args.max_rows_per_row_group:
                break
            if args.scan_limit and scanned >= args.scan_limit:
                return rows
        if args.sampling_profile == "head" and args.limit and len(rows) >= args.limit:
            return rows
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parquet", type=Path, default=DEFAULT_PARQUET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Maximum rows to write. 0 means all rows.")
    parser.add_argument("--sampling-profile", choices=["head", "stratified"], default="head")
    parser.add_argument("--sample-size", type=int, default=0, help="Rows to write after stratified selection.")
    parser.add_argument("--scan-limit", type=int, default=0, help="Rows to scan before selection. 0 means no global scan cap.")
    parser.add_argument("--max-rows-per-row-group", type=int, default=0, help="Rows to scan from each parquet row group.")
    parser.add_argument("--batch-size", type=int, default=128)
    args = parser.parse_args()

    parquet = pq.ParquetFile(args.parquet)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    diagnostics: Counter[str] = Counter()
    rows = collect_rows(parquet, args, diagnostics)
    if args.sampling_profile == "stratified":
        selected = stratified_select(rows, args.sample_size or args.limit)
    elif args.limit:
        selected = rows[:args.limit]
    else:
        selected = rows

    with args.output.open("w", encoding="utf-8") as handle:
        for item in selected:
            handle.write(json.dumps(item, ensure_ascii=True, sort_keys=True) + "\n")

    print(json.dumps({
        "ok": True,
        "output": str(args.output),
        "written": len(selected),
        "scanned": len(rows),
        "parquet_rows": parquet.metadata.num_rows,
        "sampling_profile": args.sampling_profile,
        "diagnostics": dict(sorted(diagnostics.items())),
        "raw_content_persisted": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
