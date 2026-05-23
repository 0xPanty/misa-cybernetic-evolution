import {
  BLOCKED_OPERATIONS,
  LIVE_EFFECTS_OFF
} from "./evolution-tournament-contract.mjs";

export function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function uniqueStrings(values) {
  return [...new Set((values ?? [])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

export function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function safeId(value) {
  return String(value ?? "candidate")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "candidate";
}

export function stableHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function estimateTokens(text) {
  return String(text ?? "")
    .split(/[^\p{L}\p{N}_:/.-]+/u)
    .filter(Boolean)
    .length;
}

export function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function noLiveEffects(effects) {
  return !Object.values(effects ?? {}).some(Boolean);
}

export function commonSafety() {
  return {
    production_authority: false,
    publication_allowed: false,
    automatic_write_allowed: false,
    llm_route_decision_allowed: false,
    requires_human_approval_for_production: true,
    live_effects: { ...LIVE_EFFECTS_OFF },
    blocked_operations: [...BLOCKED_OPERATIONS]
  };
}
