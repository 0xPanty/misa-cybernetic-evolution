import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PERCEPTION_LOG_ROOT = "runs/perception-runtime";

const LAYOUT_DIRECTORIES = [
  {
    key: "raw_logs",
    rel_path: "runtime/raw",
    layer: "runtime_logs",
    purpose: "store original runtime logs before redaction",
    readable_by_perception: false,
    allowed_contents: ["raw_runtime_log", "raw_tool_trace", "raw_channel_event"],
    blocked_contents: ["learning_input", "qianxuesen_handoff", "public_artifact"],
    handoff_target: "none"
  },
  {
    key: "redacted_sources",
    rel_path: "runtime/redacted-sources",
    layer: "runtime_logs",
    purpose: "store redacted logs and local_distillation_source shaped inputs for perception",
    readable_by_perception: true,
    allowed_contents: ["redacted_runtime_log", "redacted_tool_trace", "redacted_channel_event", "local_distillation_source"],
    blocked_contents: ["raw_runtime_log", "secret", "direct_memory_write"],
    handoff_target: "none"
  },
  {
    key: "digests",
    rel_path: "perception/digests",
    layer: "perception",
    purpose: "store shadow perception digest outputs and duplicate-cluster reports",
    readable_by_perception: true,
    allowed_contents: ["perception_digest", "duplicate_cluster_report"],
    blocked_contents: ["raw_runtime_log", "secret", "production_decision"],
    handoff_target: "none"
  },
  {
    key: "signal_ledger",
    rel_path: "perception/signal-ledger",
    layer: "perception",
    purpose: "store signal fingerprints and handled status for repeat detection",
    readable_by_perception: true,
    allowed_contents: ["signal_ledger", "ledger_update_proposal"],
    blocked_contents: ["raw_runtime_log", "automatic_memory_write"],
    handoff_target: "none"
  },
  {
    key: "attention_queue",
    rel_path: "perception/attention",
    layer: "perception",
    purpose: "store prioritized hint-only items and action recommendations for downstream review",
    readable_by_perception: true,
    allowed_contents: ["attention_queue", "action_recommendation"],
    blocked_contents: ["raw_runtime_log", "route_override", "winner_override"],
    handoff_target: "qianxuesen"
  },
  {
    key: "handoffs",
    rel_path: "handoff",
    layer: "handoff",
    purpose: "store selected redacted refs, Qianxuesen summaries, repair tickets, and work orders",
    readable_by_perception: false,
    allowed_contents: ["redacted_source_ref", "attention_summary", "perception_digest_ref", "repair_ticket", "work_order"],
    blocked_contents: ["raw_runtime_log", "secret", "automatic_route_change", "automatic_execution", "durable_execution_without_approval"],
    handoff_target: "mixed"
  },
  {
    key: "archive",
    rel_path: "archive",
    layer: "archive",
    purpose: "store noise, suppressed repeats, and rejected candidates with reasons",
    readable_by_perception: true,
    allowed_contents: ["noise_record", "suppression_reason", "suppressed_signal_record", "seen_count_update", "rejected_candidate", "rejection_reason"],
    blocked_contents: ["raw_runtime_log", "secret", "automatic_memory_write", "production_decision"],
    handoff_target: "none"
  }
];

const FLOW_EDGES = [
  ["raw_logs", "redacted_sources", "redaction_required"],
  ["redacted_sources", "digests", "perception_digest_shadow_only"],
  ["digests", "signal_ledger", "no_write_ledger_update_proposals_only"],
  ["digests", "attention_queue", "prioritize_before_qianxuesen"],
  ["attention_queue", "handoffs", "selected_redacted_refs_or_handoff_candidates_only"],
  ["attention_queue", "archive", "noise_suppressed_or_rejected_only"]
];

function isoNow(now) {
  return (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();
}

function normalizeRoot(rootDir) {
  return String(rootDir || DEFAULT_PERCEPTION_LOG_ROOT).replace(/\\/g, "/").replace(/\/+$/, "");
}

function joinLogicalPath(rootDir, relPath) {
  return `${normalizeRoot(rootDir)}/${relPath}`.replace(/\/+/g, "/");
}

export function buildPerceptionLogLayout({
  rootDir = DEFAULT_PERCEPTION_LOG_ROOT,
  now = new Date()
} = {}) {
  const normalizedRoot = normalizeRoot(rootDir);
  const directories = LAYOUT_DIRECTORIES.map((entry) => ({
    ...entry,
    path: joinLogicalPath(normalizedRoot, entry.rel_path),
    create_on_init: true,
    authority: "layout_contract_only"
  }));

  return {
    schema_version: "misa.perception_log_layout.v1",
    layout_id: "perception-log-layout-v1",
    mode: "shadow-perception-log-layout",
    generated_at: isoNow(now),
    root_dir: normalizedRoot,
    shadow_only: true,
    directories,
    flow_edges: FLOW_EDGES.map(([from, to, gate]) => ({
      from,
      to,
      gate,
      authority: "layout_contract_only"
    })),
    rules: {
      raw_logs_are_not_learning_material: true,
      redaction_required_before_perception: true,
      redacted_sources_are_perception_input: true,
      perception_digest_is_hint_only: true,
      signal_ledger_updates_are_proposals_only: true,
      qianxuesen_keeps_route_authority: true,
      production_authority: false
    },
    summary: {
      directory_count: directories.length,
      flow_edge_count: FLOW_EDGES.length,
      perception_readable_count: directories.filter((entry) => entry.readable_by_perception).length,
      handoff_directory_count: directories.filter((entry) => entry.layer === "handoff").length,
      archive_directory_count: directories.filter((entry) => entry.layer === "archive").length,
      llm_api_calls: 0,
      external_api_calls: 0,
      production_authority: false
    },
    safety: {
      production_authority: false,
      writes_persistent_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      installs_skills: false,
      publication_allowed: false,
      changes_route: false,
      changes_winner: false,
      starts_services: false,
      llm_api_calls: 0,
      external_api_calls: 0
    }
  };
}

function isInsideOrEqual(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function initializePerceptionLogLayout({
  rootDir = DEFAULT_PERCEPTION_LOG_ROOT,
  repoRoot = process.cwd(),
  now = new Date()
} = {}) {
  const layout = buildPerceptionLogLayout({ rootDir, now });
  const resolvedRoot = path.resolve(repoRoot, layout.root_dir);
  const createdPaths = [];

  for (const directory of layout.directories) {
    const target = path.resolve(repoRoot, directory.path);
    if (!isInsideOrEqual(resolvedRoot, target)) {
      throw new Error(`Refusing to initialize perception log directory outside root: ${directory.path}`);
    }
    await fs.mkdir(target, { recursive: true });
    createdPaths.push(directory.path);
  }

  return {
    ...layout,
    initialized: true,
    created_paths: createdPaths
  };
}

export function summarizePerceptionLogLayout(layout) {
  return {
    mode: layout.mode,
    root_dir: layout.root_dir,
    directory_count: layout.summary.directory_count,
    perception_readable_count: layout.summary.perception_readable_count,
    handoff_directory_count: layout.summary.handoff_directory_count,
    archive_directory_count: layout.summary.archive_directory_count,
    production_authority: layout.safety.production_authority,
    llm_api_calls: layout.safety.llm_api_calls,
    external_api_calls: layout.safety.external_api_calls
  };
}
