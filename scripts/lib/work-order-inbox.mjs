import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_WORK_ORDER_INBOX_ROOT = "runs/work-orders/cybernetic";

const STATES = ["inbox", "in-progress", "done", "failed", "ignored"];
const MAX_EVIDENCE_EXAMPLES = 10;
const MAX_OCCURRENCE_TIMELINE = 5000;
const MAX_OWNER_DIGEST_SESSION_IDS = 25;
const MAX_OWNER_DIGEST_ITEMS = 25;
const OBSERVATION_SHORT_WINDOW_MS = 60 * 60 * 1000;
const OBSERVATION_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const OBSERVATION_RECURRING_THRESHOLD = 2;
const OBSERVATION_SPIKE_THRESHOLD = 5;

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

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function asTimeMs(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function classifyFailureReason(reason) {
  const text = String(reason || "failed").toLowerCase();

  if (text.includes("read operation timed out")) return "read-timeout";
  if (text.includes("http 504") || text.includes("openai_error") || text.includes("bad_response_status_code")) {
    return "provider-504";
  }
  if (text.includes("expecting value: line 1 column 1")) return "empty-json-response";
  if (text.includes("missing messages list")) return "missing-messages-list";

  return `other-${stableSlug(reason || "failed").slice(0, 48)}`;
}

function compactOccurrence(occurrence) {
  return {
    occurrence_key: occurrence.occurrence_key,
    session_id: occurrence.session_id,
    reason_class: occurrence.reason_class,
    seen_at: occurrence.seen_at
  };
}

function countSince(timeline, cutoffMs) {
  return timeline.filter((occurrence) => {
    const seenMs = asTimeMs(occurrence.seen_at);
    return seenMs !== null && seenMs >= cutoffMs;
  }).length;
}

function refreshObservation(aggregate, {
  severity = "P3",
  now = new Date(),
  addedOccurrenceCount = aggregate.occurrence_count
} = {}) {
  const nowMs = now.getTime();
  const timeline = Array.isArray(aggregate.occurrence_timeline)
    ? aggregate.occurrence_timeline
    : [];
  const recentWindowCount = countSince(timeline, nowMs - OBSERVATION_SHORT_WINDOW_MS);
  const dailyWindowCount = countSince(timeline, nowMs - OBSERVATION_DAILY_WINDOW_MS);
  const reportState = aggregate.report_state ?? {
    last_reported_at: null,
    last_reported_occurrence_count: 0
  };
  const reportedOccurrenceCount = Number(reportState.last_reported_occurrence_count ?? 0);
  const hasOwnerReport = reportedOccurrenceCount > 0 || Boolean(reportState.last_reported_at);
  const newSinceLastReport = Math.max(
    0,
    aggregate.occurrence_count - reportedOccurrenceCount
  );

  let trend = "quiet";
  if (aggregate.occurrence_count === 1) {
    trend = "new";
  } else if (recentWindowCount >= OBSERVATION_SPIKE_THRESHOLD) {
    trend = "spike";
  } else if (aggregate.occurrence_count >= OBSERVATION_RECURRING_THRESHOLD) {
    trend = "recurring";
  }

  const reportReasons = new Set();
  if (aggregate.observation?.report_needed === true && newSinceLastReport > 0) {
    for (const reason of aggregate.observation.report_reasons ?? ["pending_owner_report"]) {
      reportReasons.add(reason);
    }
    reportReasons.add("pending_owner_report");
  }
  if (newSinceLastReport > 0 && !hasOwnerReport && severity === "P1") {
    reportReasons.add("new_p1_open_work_order");
  }
  if (
    newSinceLastReport > 0
    && trend === "spike"
    && (!hasOwnerReport || newSinceLastReport >= OBSERVATION_SPIKE_THRESHOLD)
  ) {
    reportReasons.add("short_window_spike");
  }
  if (newSinceLastReport >= OBSERVATION_SPIKE_THRESHOLD) {
    reportReasons.add("unreported_occurrence_growth");
  }

  aggregate.report_state = reportState;
  aggregate.observation = {
    trend,
    report_needed: reportReasons.size > 0,
    report_reasons: [...reportReasons],
    added_occurrence_count: addedOccurrenceCount,
    new_since_last_report: newSinceLastReport,
    last_observed_at: now.toISOString(),
    windows: {
      short: {
        label: "1h",
        count: recentWindowCount,
        spike_threshold: OBSERVATION_SPIKE_THRESHOLD
      },
      daily: {
        label: "24h",
        count: dailyWindowCount
      }
    },
    behavior: reportReasons.size > 0 ? "report_owner_digest" : "observe_only"
  };

  return aggregate.observation;
}

function sessionFailureClass(order) {
  const findingId = order.finding_id ?? order.work_order_id ?? "";
  const title = order.title ?? "";
  const isSessionFailure = findingId === "session-distiller-failed-session"
    || String(title).toLowerCase() === "session distiller has failed sessions";
  if (!isSessionFailure) return null;

  const failedSessions = Array.isArray(order.evidence?.failed_sessions)
    ? order.evidence.failed_sessions
    : [];
  const classes = uniqueValues(failedSessions.map((session) => classifyFailureReason(session.reason)));

  if (classes.length === 1) return classes[0];
  if (classes.length > 1) return `mixed-${stableHash(classes.sort())}`;
  return "unknown-session-failure";
}

function dedupeGroupKeyForOrder(order, inboxKey) {
  const failureClass = sessionFailureClass(order);
  if (failureClass) {
    return [
      "finding",
      stableSlug(order.finding_id ?? "session-distiller-failed-session"),
      stableSlug(order.title ?? "session distiller has failed sessions"),
      failureClass
    ].join(":");
  }

  return `exact:${inboxKey}`;
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

function reviewTimeForItem(item) {
  return item.source?.review_created_at
    ?? item.lifecycle?.created_at
    ?? new Date().toISOString();
}

function occurrencesForItem(item) {
  const failedSessions = Array.isArray(item.evidence?.failed_sessions)
    ? item.evidence.failed_sessions
    : [];

  if (failedSessions.length > 0) {
    return failedSessions.map((session) => {
      const reasonClass = classifyFailureReason(session.reason);
      return {
        occurrence_key: stableHash({
          group: item.dedupe_group_key,
          session_id: session.session_id ?? null,
          reason_class: reasonClass,
          reason: session.reason ?? "failed"
        }),
        session_id: session.session_id ?? null,
        reason: session.reason ?? "failed",
        reason_class: reasonClass,
        review_file: item.source?.review_file ?? null,
        seen_at: reviewTimeForItem(item)
      };
    });
  }

  return [{
    occurrence_key: item.inbox_key,
    session_id: null,
    reason: item.problem_statement || item.title || "work-order",
    reason_class: item.dedupe_group_key ?? `exact:${item.inbox_key}`,
    review_file: item.source?.review_file ?? null,
    seen_at: reviewTimeForItem(item)
  }];
}

function buildAggregate(item, now = new Date()) {
  const occurrences = occurrencesForItem(item);
  const reasonCounts = {};
  for (const occurrence of occurrences) {
    reasonCounts[occurrence.reason_class] = (reasonCounts[occurrence.reason_class] ?? 0) + 1;
  }

  const seenTimes = occurrences.map((occurrence) => occurrence.seen_at).filter(Boolean).sort();
  const aggregate = {
    group_key: item.dedupe_group_key,
    occurrence_count: occurrences.length,
    first_seen: seenTimes[0] ?? reviewTimeForItem(item),
    last_seen: seenTimes.at(-1) ?? reviewTimeForItem(item),
    reason_counts: reasonCounts,
    session_ids: uniqueValues(occurrences.map((occurrence) => occurrence.session_id)),
    occurrence_keys: uniqueValues(occurrences.map((occurrence) => occurrence.occurrence_key)),
    occurrence_timeline: occurrences.map(compactOccurrence),
    evidence_examples: occurrences.slice(0, MAX_EVIDENCE_EXAMPLES).map((occurrence) => ({
      session_id: occurrence.session_id,
      reason: occurrence.reason,
      reason_class: occurrence.reason_class,
      review_file: occurrence.review_file,
      seen_at: occurrence.seen_at
    }))
  };
  refreshObservation(aggregate, {
    severity: item.severity,
    now,
    addedOccurrenceCount: occurrences.length
  });
  return aggregate;
}

function ensureAggregate(item, now = new Date()) {
  if (item.aggregate?.group_key === item.dedupe_group_key && Array.isArray(item.aggregate.occurrence_keys)) {
    item.aggregate.occurrence_timeline ??= item.aggregate.evidence_examples?.map((example) => ({
      occurrence_key: stableHash({
        group: item.dedupe_group_key,
        session_id: example.session_id ?? null,
        reason_class: example.reason_class ?? "unknown",
        reason: example.reason ?? "unknown"
      }),
      session_id: example.session_id ?? null,
      reason_class: example.reason_class ?? "unknown",
      seen_at: example.seen_at ?? item.aggregate.last_seen
    })) ?? [];
    refreshObservation(item.aggregate, {
      severity: item.severity,
      now,
      addedOccurrenceCount: 0
    });
    return item.aggregate;
  }
  item.aggregate = buildAggregate(item, now);
  return item.aggregate;
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
  const dedupeGroupKey = dedupeGroupKeyForOrder(order, hash);

  const item = {
    schema_version: "misa.cybernetic_work_order_inbox_item.v1",
    work_order_id: workOrderId,
    inbox_key: hash,
    dedupe_group_key: dedupeGroupKey,
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

  item.aggregate = buildAggregate(item, now);
  return item;
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

async function readInboxItem(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function groupKeyForExistingItem(item) {
  if (item.dedupe_group_key) return item.dedupe_group_key;
  const order = item.raw_work_order ?? item;
  return dedupeGroupKeyForOrder(order, item.inbox_key ?? stableHash({
    title: item.title,
    evidence: item.evidence,
    actions: item.recommended_next_actions
  }));
}

async function indexOpenInboxByGroup(root) {
  const byGroup = new Map();
  for (const file of await listInboxItems(root)) {
    const item = await readInboxItem(file);
    if (item.lifecycle?.state !== "inbox") continue;
    item.dedupe_group_key = groupKeyForExistingItem(item);
    ensureAggregate(item);
    if (!byGroup.has(item.dedupe_group_key)) {
      byGroup.set(item.dedupe_group_key, { file, item });
    }
  }

  return byGroup;
}

function mergeIntoExistingItem(existingItem, incomingItem, now) {
  const existingAggregate = ensureAggregate(existingItem);
  const incomingOccurrences = occurrencesForItem(incomingItem);
  const existingKeys = new Set(existingAggregate.occurrence_keys ?? []);
  const newOccurrences = incomingOccurrences.filter((occurrence) => !existingKeys.has(occurrence.occurrence_key));

  if (newOccurrences.length === 0) {
    return { changed: false, added_occurrence_count: 0 };
  }

  for (const occurrence of newOccurrences) {
    existingKeys.add(occurrence.occurrence_key);
    existingAggregate.reason_counts[occurrence.reason_class] =
      (existingAggregate.reason_counts[occurrence.reason_class] ?? 0) + 1;
    if (occurrence.session_id && !existingAggregate.session_ids.includes(occurrence.session_id)) {
      existingAggregate.session_ids.push(occurrence.session_id);
    }
    existingAggregate.evidence_examples.push({
      session_id: occurrence.session_id,
      reason: occurrence.reason,
      reason_class: occurrence.reason_class,
      review_file: occurrence.review_file,
      seen_at: occurrence.seen_at
    });
  }

  existingAggregate.occurrence_keys = [...existingKeys];
  existingAggregate.occurrence_count = existingAggregate.occurrence_keys.length;
  existingAggregate.occurrence_timeline = [
    ...(existingAggregate.occurrence_timeline ?? []),
    ...newOccurrences.map(compactOccurrence)
  ].slice(-MAX_OCCURRENCE_TIMELINE);
  existingAggregate.evidence_examples = existingAggregate.evidence_examples.slice(-MAX_EVIDENCE_EXAMPLES);
  existingAggregate.last_seen = [
    existingAggregate.last_seen,
    ...newOccurrences.map((occurrence) => occurrence.seen_at)
  ].filter(Boolean).sort().at(-1);
  existingAggregate.first_seen = [
    existingAggregate.first_seen,
    ...newOccurrences.map((occurrence) => occurrence.seen_at)
  ].filter(Boolean).sort()[0];

  existingItem.lifecycle.updated_at = now.toISOString();
  existingItem.source ??= {};
  existingItem.source.latest_review_file = incomingItem.source?.review_file ?? null;
  existingItem.source.latest_review_created_at = incomingItem.source?.review_created_at ?? null;
  refreshObservation(existingAggregate, {
    severity: existingItem.severity,
    now,
    addedOccurrenceCount: newOccurrences.length
  });
  return { changed: true, added_occurrence_count: newOccurrences.length };
}

function stampFor(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ownerDigestItemForInboxItem(item, itemPath) {
  const aggregate = item.aggregate ?? {};
  const observation = aggregate.observation ?? {};
  const sessionIds = aggregate.session_ids ?? [];
  return {
    work_order_id: item.work_order_id,
    title: item.title,
    severity: item.severity,
    state: item.lifecycle?.state ?? "unknown",
    path: itemPath,
    dedupe_group_key: item.dedupe_group_key,
    suggested_executor: item.suggested_executor,
    occurrence_count: aggregate.occurrence_count ?? 0,
    new_since_last_report: observation.new_since_last_report ?? 0,
    first_seen: aggregate.first_seen ?? null,
    last_seen: aggregate.last_seen ?? null,
    trend: observation.trend ?? "quiet",
    report_reasons: observation.report_reasons ?? [],
    reason_counts: aggregate.reason_counts ?? {},
    windows: observation.windows ?? {},
    session_id_count: sessionIds.length,
    sample_session_ids: sessionIds.slice(0, MAX_OWNER_DIGEST_SESSION_IDS),
    evidence_examples: aggregate.evidence_examples ?? [],
    recommended_next_actions: item.recommended_next_actions ?? [],
    non_goals: item.non_goals ?? [],
    execution_policy: item.execution_policy ?? {},
    safety: item.safety ?? {}
  };
}

function sortOwnerDigestItems(items) {
  const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return [...items].sort((left, right) => (
    (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9)
    || (right.new_since_last_report ?? 0) - (left.new_since_last_report ?? 0)
    || (right.occurrence_count ?? 0) - (left.occurrence_count ?? 0)
    || String(left.work_order_id).localeCompare(String(right.work_order_id))
  ));
}

function renderOwnerDigestMarkdown(digest) {
  const lines = [
    "# Cybernetic Work Order Owner Digest",
    "",
    `- digest_id: ${digest.digest_id}`,
    `- created_at: ${digest.created_at}`,
    `- report_item_count: ${digest.summary.report_item_count}`,
    `- total_new_since_last_report: ${digest.summary.total_new_since_last_report}`,
    `- total_occurrence_count: ${digest.summary.total_occurrence_count}`,
    `- spike_count: ${digest.summary.spike_count}`,
    `- auto_execute: ${digest.safety.auto_execute}`,
    `- executes_work_orders: ${digest.safety.executes_work_orders}`,
    ""
  ];

  for (const item of digest.items) {
    lines.push(
      `## ${item.severity} ${item.title}`,
      "",
      `- work_order_id: ${item.work_order_id}`,
      `- trend: ${item.trend}`,
      `- new_since_last_report: ${item.new_since_last_report}`,
      `- occurrence_count: ${item.occurrence_count}`,
      `- reason_counts: ${JSON.stringify(item.reason_counts)}`,
      `- short_window_count: ${item.windows?.short?.count ?? 0}`,
      `- suggested_executor: ${item.suggested_executor?.executor_type ?? "unknown"}`,
      `- report_reasons: ${(item.report_reasons ?? []).join(", ") || "none"}`,
      "",
      "Recommended next actions:"
    );
    for (const action of item.recommended_next_actions ?? []) {
      lines.push(`- ${action}`);
    }
    lines.push("", "Non-goals:");
    for (const nonGoal of item.non_goals ?? []) {
      lines.push(`- ${nonGoal}`);
    }
    lines.push("", "Evidence examples:");
    for (const example of (item.evidence_examples ?? []).slice(0, 5)) {
      lines.push(`- ${example.session_id ?? "unknown-session"}: ${example.reason_class ?? "unknown"} (${example.reason ?? "no reason"})`);
    }
    lines.push("");
  }

  if (digest.items.length === 0) {
    lines.push("No owner-visible work orders need reporting.", "");
  }

  return `${lines.join("\n")}\n`;
}

async function ensureOwnerReportTree(root) {
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
}

async function reportedInboxEntries(root, now) {
  const entries = [];
  for (const file of await listInboxItems(root)) {
    const item = await readInboxItem(file);
    if (item.lifecycle?.state !== "inbox") continue;
    item.dedupe_group_key = groupKeyForExistingItem(item);
    ensureAggregate(item, now);
    if (item.aggregate?.observation?.report_needed === true) {
      entries.push({ file, item });
    }
  }
  return entries;
}

function markItemReported(item, digestId, now) {
  const aggregate = ensureAggregate(item, now);
  aggregate.report_state = {
    ...(aggregate.report_state ?? {}),
    last_reported_at: now.toISOString(),
    last_reported_occurrence_count: aggregate.occurrence_count,
    last_report_digest_id: digestId
  };
  aggregate.owner_report_history = [
    ...(aggregate.owner_report_history ?? []),
    {
      digest_id: digestId,
      reported_at: now.toISOString(),
      occurrence_count: aggregate.occurrence_count
    }
  ].slice(-25);
  refreshObservation(aggregate, {
    severity: item.severity,
    now,
    addedOccurrenceCount: 0
  });
  item.lifecycle.updated_at = now.toISOString();
  item.lifecycle.last_reported_at = now.toISOString();
  return item;
}

export async function exportInboxOwnerDigest({
  root = DEFAULT_WORK_ORDER_INBOX_ROOT,
  repoRoot = process.cwd(),
  now = new Date(),
  markReported = true
} = {}) {
  const resolvedRoot = resolveRoot(root, repoRoot);
  await ensureInboxTree(resolvedRoot);
  await ensureOwnerReportTree(resolvedRoot);

  const entries = await reportedInboxEntries(resolvedRoot, now);
  const sortedItems = sortOwnerDigestItems(entries.map(({ file, item }) => ownerDigestItemForInboxItem(item, file)));
  const visibleItems = sortedItems.slice(0, MAX_OWNER_DIGEST_ITEMS);
  const digestId = `owner-digest-${stampFor(now)}`;
  const digest = {
    schema_version: "misa.cybernetic_work_order_owner_digest.v1",
    mode: "cybernetic-work-order-owner-digest",
    ok: true,
    digest_id: digestId,
    created_at: now.toISOString(),
    root: resolvedRoot,
    summary: {
      report_item_count: visibleItems.length,
      suppressed_item_count: Math.max(0, sortedItems.length - visibleItems.length),
      total_new_since_last_report: visibleItems.reduce((sum, item) => sum + Number(item.new_since_last_report ?? 0), 0),
      total_occurrence_count: visibleItems.reduce((sum, item) => sum + Number(item.occurrence_count ?? 0), 0),
      spike_count: visibleItems.filter((item) => item.trend === "spike").length,
      mark_reported: markReported
    },
    items: visibleItems,
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: "Primary agent",
      owner_visible: true,
      default_next_step: visibleItems.length > 0 ? "report_owner_digest_then_wait" : "no_report_needed"
    },
    safety: {
      ...SAFETY,
      auto_execute: false,
      executes_work_orders: false,
      marks_reported: markReported,
      writes_owner_digest: true
    }
  };

  const jsonPath = path.join(resolvedRoot, "reports", `${digestId}.json`);
  const markdownPath = path.join(resolvedRoot, "reports", `${digestId}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderOwnerDigestMarkdown(digest), "utf8");
  await fs.writeFile(path.join(resolvedRoot, "latest-owner-digest.json"), `${JSON.stringify({
    ...digest,
    artifacts: {
      json: jsonPath,
      markdown: markdownPath
    }
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(resolvedRoot, "latest-owner-digest.md"), renderOwnerDigestMarkdown(digest), "utf8");

  if (markReported) {
    const visiblePaths = new Set(visibleItems.map((item) => item.path));
    for (const { file, item } of entries) {
      if (!visiblePaths.has(file)) continue;
      markItemReported(item, digestId, now);
      await fs.writeFile(file, `${JSON.stringify(item, null, 2)}\n`, "utf8");
    }
  }

  return {
    ...digest,
    artifacts: {
      json: jsonPath,
      markdown: markdownPath
    }
  };
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
  const mergedExisting = [];
  const skippedExisting = [];
  const existingByGroup = await indexOpenInboxByGroup(resolvedRoot);

  for (const [index, order] of workOrders.entries()) {
    const item = normalizeInboxItem({ order, review: reviewPayload, reviewFile, now, index });
    const fileName = `${item.severity.toLowerCase()}-${stableSlug(item.title)}-${item.inbox_key}.json`;
    const target = path.join(resolvedRoot, "inbox", fileName);
    const existing = existingByGroup.get(item.dedupe_group_key);
    if (existing) {
      const mergeResult = mergeIntoExistingItem(existing.item, item, now);
      if (mergeResult.changed) {
        await fs.writeFile(existing.file, `${JSON.stringify(existing.item, null, 2)}\n`, "utf8");
        mergedExisting.push({
          work_order_id: existing.item.work_order_id,
          severity: existing.item.severity,
          title: existing.item.title,
          path: existing.file,
          dedupe_group_key: item.dedupe_group_key,
          added_occurrence_count: mergeResult.added_occurrence_count,
          occurrence_count: existing.item.aggregate.occurrence_count,
          observation: existing.item.aggregate.observation
        });
      } else {
        skippedExisting.push({
          work_order_id: existing.item.work_order_id,
          severity: existing.item.severity,
          title: existing.item.title,
          path: existing.file,
          dedupe_group_key: item.dedupe_group_key
        });
      }
      continue;
    }

    try {
      await fs.writeFile(target, `${JSON.stringify(item, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      existingByGroup.set(item.dedupe_group_key, { file: target, item });
      written.push({
        work_order_id: item.work_order_id,
        severity: item.severity,
        title: item.title,
        path: target,
        dedupe_group_key: item.dedupe_group_key,
        occurrence_count: item.aggregate.occurrence_count,
        observation: item.aggregate.observation
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      skippedExisting.push({
        work_order_id: item.work_order_id,
        severity: item.severity,
        title: item.title,
        path: target,
        dedupe_group_key: item.dedupe_group_key
      });
    }
  }

  const inboxFiles = await listInboxItems(resolvedRoot);
  const inboxItems = await Promise.all(inboxFiles.map((file) => readInboxItem(file)));
  const reportNeededCount = inboxItems.filter((item) => item.aggregate?.observation?.report_needed === true).length;
  const spikeCount = inboxItems.filter((item) => item.aggregate?.observation?.trend === "spike").length;
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
      latest_merged_existing: mergedExisting.length,
      latest_skipped_existing: skippedExisting.length,
      report_needed: reportNeededCount,
      spike: spikeCount
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
      merged_existing_count: mergedExisting.length,
      skipped_existing_count: skippedExisting.length,
      inbox_count: inboxFiles.length,
      report_needed_count: reportNeededCount,
      spike_count: spikeCount,
      auto_execute: false
    },
    written,
    merged_existing: mergedExisting,
    skipped_existing: skippedExisting,
    safety: { ...SAFETY }
  };

  await fs.writeFile(path.join(resolvedRoot, "latest-export.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
