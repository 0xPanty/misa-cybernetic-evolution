import fs from "node:fs/promises";
import path from "node:path";

const REDACTION_NOTE = "Derived from VPS sanitized-conversation artifacts copied read-only for local validation; source text remains redacted.";

function slug(value) {
  return String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function redactText(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s)]+/gi, "[REDACTED:URL]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED:SECRET]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:GITHUB_TOKEN]")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function collectText(value, out = []) {
  if (typeof value === "string") {
    const text = redactText(value);
    if (text.length > 24 && !text.startsWith("safe-prefix-") && !text.startsWith("embed-prefix-")) {
      out.push(text);
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) {
      collectText(item, out);
    }
    return out;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectText(item, out);
    }
  }

  return out;
}

function conversationStats(data) {
  const cast = data?.conversation?.cast;
  const replies = Array.isArray(cast?.direct_replies) ? cast.direct_replies : [];

  return {
    cast_text: redactText(cast?.text ?? ""),
    direct_reply_count: replies.length,
    reply_texts: replies.map((reply) => redactText(reply?.text ?? "")).filter(Boolean),
    has_large_payload: Object.keys(data ?? {}).some((key) => key.includes("large")),
    has_redacted_fields: Object.keys(data ?? {}).some((key) => key.includes("redacted_sensitive_field"))
  };
}

function sourceShape({
  id,
  sourceKind,
  channel = "farcaster",
  createdAt,
  summary,
  setpoint,
  signals,
  outcome = "success",
  riskLevel = "medium",
  sourceRefs,
  turns,
  toolErrors = []
}) {
  return {
    schema_version: "misa.local_distillation_source.v1",
    source_id: id,
    source_kind: sourceKind,
    channel,
    created_at: createdAt,
    local_only: true,
    uses_zilliz_proxy: false,
    vector_lookup_required: false,
    raw_window_default: false,
    redaction_status: "redacted",
    redaction_note: REDACTION_NOTE,
    summary,
    setpoint,
    evidence_count: Math.max(2, turns.length),
    outcome,
    risk_level: riskLevel,
    source_refs: uniqueStrings(sourceRefs),
    signals: uniqueStrings(signals),
    artifact_evidence: {
      injected: [],
      read: ["vps:sanitized-conversation-artifact"],
      modified: [],
      tool_errors: uniqueStrings(toolErrors)
    },
    turns
  };
}

function buildSourceFromConversation({ fileName, data, index }) {
  const idBase = `vps-${slug(fileName)}`;
  const stats = conversationStats(data);
  const collected = uniqueStrings(collectText(data)).slice(0, 6);
  const createdAt = new Date(Date.UTC(2026, 3, 21, 0, index, 0)).toISOString();
  const baseTurns = [
    {
      speaker: "vps-artifact",
      ref: `${idBase}:cast`,
      text: stats.cast_text || "VPS sanitized conversation artifact with redacted public-channel content."
    },
    ...stats.reply_texts.slice(0, 3).map((text, replyIndex) => ({
      speaker: "vps-reply",
      ref: `${idBase}:reply:${replyIndex + 1}`,
      text
    }))
  ];

  if (index === 0) {
    return sourceShape({
      id: `${idBase}-redaction-workflow`,
      sourceKind: "chat_window",
      channel: "local",
      createdAt,
      summary: "A VPS sanitized conversation artifact shows a repeatable redaction validation workflow for message data.",
      setpoint: "turn repeated redaction verification into a reusable local skill draft",
      signals: ["reusable_workflow", "stable_project_fact"],
      outcome: "success",
      riskLevel: "low",
      sourceRefs: baseTurns.map((turn) => turn.ref),
      turns: [
        {
          speaker: "vps-artifact",
          ref: `${idBase}:workflow`,
          text: "Use the sanitized conversation artifact as a repeatable workflow: collect message text, redact URLs and sensitive fields, preserve source refs, then run local validation before any export."
        },
        ...baseTurns.slice(0, 3)
      ]
    });
  }

  if (index === 1) {
    return sourceShape({
      id: `${idBase}-higher-order-case`,
      sourceKind: "failure_log",
      createdAt,
      summary: "A VPS higher-order sanitized conversation artifact carries repeated nested payload and redaction edge cases.",
      setpoint: "record repeated sanitizer edge cases as a case candidate before changing runtime behavior",
      signals: ["repeated_failure_pattern", "stable_project_fact"],
      outcome: "partial",
      riskLevel: "medium",
      sourceRefs: baseTurns.map((turn) => turn.ref),
      toolErrors: ["vps:sanitizer-higher-order-payload"],
      turns: [
        {
          speaker: "vps-artifact",
          ref: `${idBase}:case`,
          text: `Repeated higher-order sanitizer artifact: replies=${stats.direct_reply_count}, redacted_fields=${stats.has_redacted_fields}, large_payload=${stats.has_large_payload}.`
        },
        ...baseTurns.slice(0, 3)
      ]
    });
  }

  return sourceShape({
    id: `${idBase}-public-boundary`,
    sourceKind: "farcaster_audit",
    createdAt,
    summary: "A VPS public-channel conversation artifact confirms replies and public posts need local safety checks before reuse.",
    setpoint: "keep public-channel lessons behind policy review and local-only validation",
    signals: ["explicit_user_boundary", "public_posting_boundary", "stable_project_fact"],
    outcome: "success",
    riskLevel: "high",
    sourceRefs: baseTurns.map((turn) => turn.ref),
    turns: [
      {
        speaker: "vps-artifact",
        ref: `${idBase}:boundary`,
        text: "Public-channel conversation audit: do not turn public post or reply behavior into production changes without local checks and approval."
      },
      ...baseTurns.slice(0, 3),
      ...collected.slice(0, 1).map((text) => ({
        speaker: "vps-sanitized-extra",
        ref: `${idBase}:extra`,
        text
      }))
    ]
  });
}

export async function loadVpsConversationSources({ rawDir }) {
  if (!rawDir) {
    return [];
  }

  const entries = await fs.readdir(rawDir, { withFileTypes: true }).catch(() => []);
  const jsonFiles = entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const sources = [];

  for (const fileName of jsonFiles) {
    const raw = await fs.readFile(path.join(rawDir, fileName), "utf8");
    if (raw.trim() === "{}" || raw.trim() === "[]") {
      continue;
    }

    const data = JSON.parse(raw);
    if (!data?.conversation?.cast) {
      continue;
    }

    sources.push(buildSourceFromConversation({
      fileName,
      data,
      index: sources.length
    }));
  }

  return sources;
}
