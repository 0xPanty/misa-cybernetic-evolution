import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_WORK_ORDER_INBOX_ROOT = "runs/work-orders/cybernetic";

const STATES = ["inbox", "in-progress", "done", "failed", "ignored"];

const SAFETY = {
  no_auto_execution: true,
  agent_claim_required: true,
  production_authority: false,
  publication_allowed: false,
  writes_persistent_memory: false,
  updates_vps: false,
  live_effects: {
    writes_persistent_memory: false,
    publishes_skill: false,
    starts_timer: false,
    changes_session_mechanics: false,
    posts_publicly: false
  },
  blocked_operations: [
    "automatic_command_execution",
    "persistent_memory_write",
    "zilliz_replacement",
    "farcaster_publish",
    "skill_publication",
    "production_skill_installation",
    "session_mechanic_replacement",
    "timer_or_service_start",
    "provider_route_change"
  ]
};

function stableSlug(value) {
  return String(value || "work-order")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "work-order";
}

function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12);
}

function resolveRoot(root, repoRoot) {
  return path.isAbsolute(root)
    ? root
    : path.join(repoRoot, root);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function ensureInboxTree(root) {
  for (const state of STATES) {
    await fs.mkdir(path.join(root, state), { recursive: true });
  }
}

function chooseSuggestedExecutor(order) {
  const text = [
    order.title,
    order.problem_statement,
    ...(order.recommended_next_actions ?? [])
  ].join(" ").toLowerCase();

  if (text.includes("zilliz") || text.includes("distiller") || text.includes("provider")) {
    return {
      executor_type: "specialized_engineering_agent",
      label: "Specialized engineering agent",
      reason: "The work order is about production distillation, provider, or vector-store reliability."
    };
  }

  return {
    executor_type: "primary_agent",
    label: "Primary agent",
    reason: "The primary agent is the front door for review, owner reporting, and bounded follow-up."
  };
}

function normalizeInboxItem({ order, review, reviewFile, now, index }) {
  const sourceKey = {
    finding_id: order.finding_id ?? order.work_order_id ?? null,
    title: order.title ?? null,
    evidence: order.evidence ?? null,
    actions: order.recommended_next_actions ?? []
  };
  const hash = stableHash(sourceKey);
  const title = order.title ?? "Cybernetic repair work order";
  const severity = order.severity ?? "P3";
  const workOrderId = order.work_order_id
    ?? `wo-session-distiller-${stableSlug(title)}-${hash}`;

  return {
    schema_version: "misa.cybernetic_work_order_inbox_item.v1",
    work_order_id: workOrderId,
    inbox_key: hash,
    lifecycle: {
      state: "inbox",
      created_at: now.toISOString(),
      claimed_by: null,
      claimed_at: null,
      completed_at: null,
      result_file: null
    },
    source: {
      kind: "session_distiller_cybernetic_review",
      review_file: reviewFile ?? null,
      review_created_at: review.created_at ?? null,
      review_verdict: review.summary?.verdict ?? null,
      review_source: review.source ?? {},
      source_index: index
    },
    severity,
    status: order.status ?? "repair_candidate",
    title,
    problem_statement: order.problem_statement ?? "",
    evidence: order.evidence ?? {},
    recommended_next_actions: order.recommended_next_actions ?? [],
    non_goals: order.non_goals ?? [
      "Do not execute production actions from the inbox file itself."
    ],
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: "Primary agent",
      reason: "Every work order reaches the primary agent first for review, reporting, or owner-approved handoff."
    },
    suggested_executor: chooseSuggestedExecutor(order),
    execution_policy: {
      auto_execute: false,
      agent_self_review_allowed: true,
      durable_or_public_effect_policy: "human_owner_required",
      production_service_change_policy: "human_owner_required",
      vector_store_write_policy: "human_owner_required"
    },
    safety: {
      ...SAFETY,
      inherited_review_safety: review.safety ?? {}
    },
    raw_work_order: order
  };
}

async function listInboxItems(root) {
  const inboxDir = path.join(root, "inbox");
  let entries = [];
  try {
    entries = await fs.readdir(inboxDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(inboxDir, entry.name))
    .sort();
}

export async function exportReviewWorkOrdersToInbox({
  review,
  reviewFile,
  root = DEFAULT_WORK_ORDER_INBOX_ROOT,
  repoRoot = process.cwd(),
  now = new Date()
} = {}) {
  const reviewPayload = review ?? await readJson(reviewFile);
  const resolvedRoot = resolveRoot(root, repoRoot);
  await ensureInboxTree(resolvedRoot);

  const workOrders = Array.isArray(reviewPayload.repair_work_orders)
    ? reviewPayload.repair_work_orders
    : [];
  const written = [];
  const skippedExisting = [];

  for (const [index, order] of workOrders.entries()) {
    const item = normalizeInboxItem({ order, review: reviewPayload, reviewFile, now, index });
    const fileName = `${item.severity.toLowerCase()}-${stableSlug(item.title)}-${item.inbox_key}.json`;
    const target = path.join(resolvedRoot, "inbox", fileName);
    try {
      await fs.writeFile(target, `${JSON.stringify(item, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      written.push({
        work_order_id: item.work_order_id,
        severity: item.severity,
        title: item.title,
        path: target
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      skippedExisting.push({
        work_order_id: item.work_order_id,
        severity: item.severity,
        title: item.title,
        path: target
      });
    }
  }

  const inboxFiles = await listInboxItems(resolvedRoot);
  const indexPayload = {
    schema_version: "misa.cybernetic_work_order_inbox_index.v1",
    mode: "cybernetic-work-order-inbox-index",
    updated_at: now.toISOString(),
    root: resolvedRoot,
    inbox_dir: path.join(resolvedRoot, "inbox"),
    counts: {
      inbox: inboxFiles.length,
      latest_review_work_orders: workOrders.length,
      latest_written: written.length,
      latest_skipped_existing: skippedExisting.length
    },
    items: inboxFiles.map((file) => ({ path: file }))
  };

  await fs.writeFile(path.join(resolvedRoot, "latest-index.json"), `${JSON.stringify(indexPayload, null, 2)}\n`, "utf8");

  const result = {
    schema_version: "misa.cybernetic_work_order_inbox_export.v1",
    mode: "cybernetic-work-order-inbox-export",
    ok: true,
    created_at: now.toISOString(),
    source: {
      review_file: reviewFile ?? null,
      review_verdict: reviewPayload.summary?.verdict ?? null,
      review_work_order_count: workOrders.length
    },
    root: resolvedRoot,
    inbox_dir: path.join(resolvedRoot, "inbox"),
    summary: {
      written_count: written.length,
      skipped_existing_count: skippedExisting.length,
      inbox_count: inboxFiles.length,
      auto_execute: false
    },
    written,
    skipped_existing: skippedExisting,
    safety: { ...SAFETY }
  };

  await fs.writeFile(path.join(resolvedRoot, "latest-export.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
