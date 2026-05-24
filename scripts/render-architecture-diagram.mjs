import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(
  root,
  "docs",
  "assets",
  "misa-cybernetic-evolution-v0.28.svg",
);

const W = 1600;
const H = 1380;

const c = {
  bg: "#0a1428",
  panel: "#101c33",
  panelHi: "#162542",
  ink: "#f1f5f9",
  inkDim: "#cbd5e1",
  muted: "#94a3b8",
  faint: "#64748b",
  cyan: "#38bdf8",
  laneA: "#3b82f6",
  laneAFill: "#0f1f3a",
  laneB: "#a78bfa",
  laneBFill: "#1b1431",
  gate: "#f43f5e",
  gateGlow: "#fb7185",
  gateFill: "#2f0d22",
  out: "#10b981",
  outFill: "#0b2a1f",
  schema: "#94a3b8",
  schemaFill: "#1a1f2e",
  blocked: "#ef4444",
  blockedFill: "#2a0b0b",
};

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function text(x, y, str, opt = {}) {
  const {
    size = 13,
    color = c.ink,
    weight = 400,
    anchor = "middle",
    italic = false,
    letter = 0,
  } = opt;
  const style = italic ? ' font-style="italic"' : "";
  const ls = letter ? ` letter-spacing="${letter}"` : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif" font-size="${size}" font-weight="${weight}"${style}${ls}>${esc(str)}</text>`;
}

function lines(x, y, arr, opt = {}) {
  const { size = 12, color = c.inkDim, weight = 400, gap = 1.4 } = opt;
  const lh = Math.round(size * gap);
  return arr
    .map((line, i) =>
      text(x, y + i * lh, line, { ...opt, size, color, weight }),
    )
    .join("\n  ");
}

function box({ x, y, w, h, fill, stroke, rx = 10, strokeW = 1.6, dash = false, glow = false }) {
  const d = dash ? ' stroke-dasharray="6 5"' : "";
  const filter = glow ? ' filter="url(#gateGlow)"' : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${d}${filter}/>`;
}

function node({ x, y, w, h, title, sub = [], stroke, fill, titleColor, subColor, titleSize = 14, glow = false, rx = 8, shape = "rect" }) {
  let shapeSvg;
  if (shape === "hex") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const ix = 14;
    const path = `M ${x + ix} ${y} L ${x + w - ix} ${y} L ${x + w} ${cy} L ${x + w - ix} ${y + h} L ${x + ix} ${y + h} L ${x} ${cy} Z`;
    const filter = glow ? ' filter="url(#gateGlow)"' : "";
    shapeSvg = `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="2.2"${filter}/>`;
    void cx; void cy;
  } else if (shape === "para") {
    const skew = 12;
    const path = `M ${x + skew} ${y} L ${x + w} ${y} L ${x + w - skew} ${y + h} L ${x} ${y + h} Z`;
    shapeSvg = `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  } else {
    shapeSvg = box({ x, y, w, h, fill, stroke, rx, glow });
  }
  const titleY = sub.length ? y + 22 : y + h / 2 + 5;
  const subY = y + 42;
  return `<g>
  ${shapeSvg}
  ${text(x + w / 2, titleY, title, { size: titleSize, color: titleColor || c.ink, weight: 700 })}
  ${sub.length ? lines(x + w / 2, subY, sub, { size: 11, color: subColor || c.inkDim, gap: 1.45 }) : ""}
</g>`;
}

function arrow(x1, y1, x2, y2, opt = {}) {
  const { color = c.faint, w = 2, dash = false, label, labelOff = 10, marker = "arrow" } = opt;
  const d = dash ? ' stroke-dasharray="5 5"' : "";
  let lbl = "";
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - labelOff;
    lbl = text(mx, my, label, { size: 10.5, color: c.muted, italic: true });
  }
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"${d} marker-end="url(#${marker})"/>
  ${lbl}`;
}

function curve(d, opt = {}) {
  const { color = c.faint, w = 2, dash = false, label, labelX, labelY, marker = "arrow" } = opt;
  const ds = dash ? ' stroke-dasharray="5 5"' : "";
  let lbl = "";
  if (label) {
    lbl = text(labelX, labelY, label, { size: 10.5, color: c.muted, italic: true });
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${ds} marker-end="url(#${marker})"/>
  ${lbl}`;
}

// ---------- Layout ----------
const out = [];

out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
<title id="title">Misa Cybernetic Evolution Layer v0.28 architecture</title>
<desc id="desc">Measurement-first control loop with two evidence lanes, central measurement quality gate, L1-L4 routing, and closed-loop measurement feedback.</desc>
<defs>
  <marker id="arrow" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="strokeWidth">
    <path d="M1.5,1.5 L9.5,5.5 L1.5,9.5 Z" fill="${c.faint}"/>
  </marker>
  <marker id="arrowGate" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="strokeWidth">
    <path d="M1.5,1.5 L9.5,5.5 L1.5,9.5 Z" fill="${c.gate}"/>
  </marker>
  <marker id="arrowMuted" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="strokeWidth">
    <path d="M1.5,1.5 L9.5,5.5 L1.5,9.5 Z" fill="${c.muted}"/>
  </marker>
  <filter id="gateGlow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#0c1a32"/>
    <stop offset="50%" stop-color="#142342"/>
    <stop offset="100%" stop-color="#0c1a32"/>
  </linearGradient>
  <linearGradient id="gateGrad" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#3a0d23"/>
    <stop offset="100%" stop-color="#1f0814"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="${c.bg}"/>`);

// Background grid (subtle)
out.push(`<g opacity="0.08">`);
for (let i = 0; i < 32; i++) {
  out.push(`<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${H}" stroke="${c.faint}" stroke-width="1"/>`);
}
for (let i = 0; i < 22; i++) {
  out.push(`<line x1="0" y1="${i * 50}" x2="${W}" y2="${i * 50}" stroke="${c.faint}" stroke-width="1"/>`);
}
out.push(`</g>`);

// ---------- Title bar ----------
out.push(`<rect x="40" y="28" width="${W - 80}" height="88" rx="14" fill="url(#titleGrad)" stroke="${c.cyan}" stroke-width="1.5" opacity="0.95"/>`);
out.push(text(W / 2, 68, "Misa Cybernetic Evolution Layer · v0.28", { size: 28, weight: 800, color: c.ink, letter: 0.3 }));
out.push(text(W / 2, 96, "Measurement-first control loop · Engineering Cybernetics applied to AI agents", { size: 14, color: c.muted, weight: 500, italic: true }));

// ---------- Legend strip ----------
const legY = 132;
out.push(text(70, legY, "LEGEND", { size: 10, color: c.faint, anchor: "start", weight: 700, letter: 2 }));
const legItems = [
  { label: "data source", color: c.laneA, shape: "para" },
  { label: "process", color: c.laneA, shape: "rect" },
  { label: "★ gate", color: c.gate, shape: "hex" },
  { label: "constraint", color: c.schema, shape: "rect", dash: true },
  { label: "output stream", color: c.out, shape: "rect" },
];
let lx = 150;
for (const item of legItems) {
  if (item.shape === "para") {
    out.push(`<path d="M ${lx + 5} ${legY - 8} L ${lx + 22} ${legY - 8} L ${lx + 17} ${legY + 2} L ${lx} ${legY + 2} Z" fill="${item.color}" opacity="0.7"/>`);
  } else if (item.shape === "hex") {
    out.push(`<path d="M ${lx + 4} ${legY - 8} L ${lx + 18} ${legY - 8} L ${lx + 22} ${legY - 3} L ${lx + 18} ${legY + 2} L ${lx + 4} ${legY + 2} L ${lx} ${legY - 3} Z" fill="${item.color}" opacity="0.7"/>`);
  } else {
    out.push(`<rect x="${lx}" y="${legY - 8}" width="22" height="10" rx="2" fill="${item.color}" opacity="0.7"${item.dash ? ' stroke-dasharray="3 2" stroke="' + item.color + '" stroke-width="1.2"' : ""}/>`);
  }
  out.push(text(lx + 30, legY + 1, item.label, { size: 11, color: c.inkDim, anchor: "start", weight: 500 }));
  lx += 30 + item.label.length * 6.5 + 20;
}

// ---------- Side panel: Layer 0 Schema (LEFT) ----------
const schemaX = 40;
const schemaY = 180;
const schemaW = 230;
const schemaH = 940;
out.push(box({ x: schemaX, y: schemaY, w: schemaW, h: schemaH, fill: c.schemaFill, stroke: c.schema, rx: 12, dash: true, strokeW: 1.4 }));
out.push(text(schemaX + schemaW / 2, schemaY + 28, "LAYER 0", { size: 11, color: c.schema, weight: 700, letter: 2 }));
out.push(text(schemaX + schemaW / 2, schemaY + 48, "Schema + Redaction", { size: 14, color: c.ink, weight: 700 }));
out.push(text(schemaX + schemaW / 2, schemaY + 66, "Contract (envelopes all)", { size: 11, color: c.muted, italic: true }));

const schemaItems = [
  ["record_kind", "+ signal_origin locked"],
  ["redaction boundary", "no raw prompt persists"],
  ["no tool body", "no provider keys"],
  ["5 canary strings", "CI-blocking"],
  ["streams disjoint", "observability ⊥ work_order"],
  ["no fetch() in", "deterministic paths"],
];
let sy = schemaY + 105;
for (const [head, body] of schemaItems) {
  out.push(box({ x: schemaX + 16, y: sy, w: schemaW - 32, h: 60, fill: c.panel, stroke: c.faint, rx: 8, strokeW: 1 }));
  out.push(text(schemaX + schemaW / 2, sy + 22, head, { size: 12, color: c.ink, weight: 600 }));
  out.push(text(schemaX + schemaW / 2, sy + 41, body, { size: 10.5, color: c.muted, italic: true }));
  sy += 75;
}
out.push(text(schemaX + schemaW / 2, schemaY + schemaH - 14, "schema-locked", { size: 10, color: c.schema, italic: true, weight: 600 }));

// ---------- Side panel: BLOCKED BY DEFAULT (RIGHT) ----------
const blkX = W - 270;
const blkY = 180;
const blkW = 230;
const blkH = 940;
out.push(box({ x: blkX, y: blkY, w: blkW, h: blkH, fill: c.blockedFill, stroke: c.blocked, rx: 12, strokeW: 1.8 }));
out.push(text(blkX + blkW / 2, blkY + 30, "⛔ BLOCKED", { size: 13, color: c.blocked, weight: 800, letter: 2 }));
out.push(text(blkX + blkW / 2, blkY + 50, "BY DEFAULT", { size: 13, color: c.blocked, weight: 800, letter: 2 }));
out.push(text(blkX + blkW / 2, blkY + 70, "no path here without human grant", { size: 10.5, color: c.muted, italic: true }));

const blockedItems = [
  "memory writes",
  "skill install / publish",
  "provider route changes",
  "runtime tool block",
  "public posts",
  "VPS autonomous update",
  "agent self-review",
  "LLM-owned route / winner",
  "auto-replay from dirty telemetry",
  "promotion from runtime log",
];
let by = blkY + 100;
for (const item of blockedItems) {
  out.push(`<line x1="${blkX + 22}" y1="${by}" x2="${blkX + 32}" y2="${by}" stroke="${c.blocked}" stroke-width="2"/>`);
  out.push(text(blkX + 40, by + 4, item, { size: 11, color: "#fecaca", weight: 500, anchor: "start" }));
  by += 28;
}

// ---------- Main area (between side panels) ----------
const mainX = 300;
const mainW = W - 600;

// ---------- Lane A ----------
const laY = 170;
const laH = 380;
const laneW = (mainW - 40) / 2;
out.push(box({ x: mainX, y: laY, w: laneW, h: laH, fill: c.laneAFill, stroke: c.laneA, rx: 12, strokeW: 1.5 }));
out.push(text(mainX + 20, laY + 26, "LANE A", { size: 11, color: c.laneA, weight: 800, anchor: "start", letter: 2 }));
out.push(text(mainX + 20, laY + 46, "Qianxuesen window distillation", { size: 14, color: c.ink, weight: 700, anchor: "start" }));
out.push(text(mainX + 20, laY + 62, "redacted evidence packet", { size: 11, color: c.muted, italic: true, anchor: "start" }));

const laNodes = [
  { title: "Window bundle", sub: ["redacted slices", "local refs only"], shape: "para" },
  { title: "Source ledger", sub: ["retrieval trace · timestamps"] },
  { title: "Distillation template", sub: ["obs → claim → evidence", "counter-evidence · uncertainty"] },
  { title: "Signal map", sub: ["memory | skill | case", "policy | damping"] },
  { title: "Replay synthesis", sub: ["candidate evidence packet", "source-backed only"] },
];
const laNodeX = mainX + 20;
const laNodeW = laneW - 40;
let nyA = laY + 80;
const laNodeH = 56;
const laGap = 5;
for (const n of laNodes) {
  out.push(node({
    x: laNodeX, y: nyA, w: laNodeW, h: laNodeH,
    title: n.title, sub: n.sub,
    stroke: c.laneA, fill: c.panel,
    shape: n.shape || "rect",
  }));
  nyA += laNodeH + laGap;
}

// Internal arrows Lane A
for (let i = 0; i < laNodes.length - 1; i++) {
  const sy = laY + 80 + (i + 1) * laNodeH + i * laGap;
  out.push(`<line x1="${laNodeX + laNodeW / 2}" y1="${sy}" x2="${laNodeX + laNodeW / 2}" y2="${sy + laGap}" stroke="${c.laneA}" stroke-width="1.8" marker-end="url(#arrow)" opacity="0.55"/>`);
}

// ---------- Lane B ----------
const lbX = mainX + laneW + 40;
out.push(box({ x: lbX, y: laY, w: laneW, h: laH, fill: c.laneBFill, stroke: c.laneB, rx: 12, strokeW: 1.5 }));
out.push(text(lbX + 20, laY + 26, "LANE B", { size: 11, color: c.laneB, weight: 800, anchor: "start", letter: 2 }));
out.push(text(lbX + 20, laY + 46, "Hermes runtime + model I/O", { size: 14, color: c.ink, weight: 700, anchor: "start" }));
out.push(text(lbX + 20, laY + 62, "observability lane (no authority)", { size: 11, color: c.muted, italic: true, anchor: "start" }));

const lbNodes = [
  { title: "Runtime operation logs", sub: ["pre/post tool_call", "action identity folded"], shape: "para" },
  { title: "API boundary hooks", sub: ["pre/post api_request"], shape: "para" },
  { title: "action_history_monitor", sub: ["failure-after-repeat rate", "query entropy"] },
  { title: "model_io_tap", sub: ["context bytes · tool count", "hashes only · no raw"] },
];
const lbNodeX = lbX + 20;
const lbNodeW = laneW - 40;
let nyB = laY + 80;
const lbNodeH = 70;
const lbGap = 8;
for (const n of lbNodes) {
  out.push(node({
    x: lbNodeX, y: nyB, w: lbNodeW, h: lbNodeH,
    title: n.title, sub: n.sub,
    stroke: c.laneB, fill: c.panel,
    shape: n.shape || "rect",
  }));
  nyB += lbNodeH + lbGap;
}

// Lane B internal arrows: B1->B3, B2->B4
const b1y = laY + 80 + lbNodeH;
const b3y = laY + 80 + 2 * (lbNodeH + lbGap);
out.push(`<line x1="${lbNodeX + lbNodeW * 0.3}" y1="${b1y}" x2="${lbNodeX + lbNodeW * 0.3}" y2="${b3y}" stroke="${c.laneB}" stroke-width="1.8" marker-end="url(#arrow)" opacity="0.55"/>`);
const b2y = laY + 80 + 2 * lbNodeH + lbGap;
const b4y = laY + 80 + 3 * (lbNodeH + lbGap);
out.push(`<line x1="${lbNodeX + lbNodeW * 0.7}" y1="${b2y}" x2="${lbNodeX + lbNodeW * 0.7}" y2="${b4y}" stroke="${c.laneB}" stroke-width="1.8" marker-end="url(#arrow)" opacity="0.55"/>`);

// ---------- Gate (CENTER FOCUS) ----------
const gateW = 520;
const gateH = 180;
const gateX = (W - gateW) / 2;
const gateY = laY + laH + 50;

// Outer glow effect via larger semi-transparent shape
out.push(`<g opacity="0.35"><path d="M ${gateX - 12} ${gateY + gateH / 2} L ${gateX + 26} ${gateY - 12} L ${gateX + gateW - 26} ${gateY - 12} L ${gateX + gateW + 12} ${gateY + gateH / 2} L ${gateX + gateW - 26} ${gateY + gateH + 12} L ${gateX + 26} ${gateY + gateH + 12} Z" fill="${c.gate}"/></g>`);

// Main hex gate
const hexInset = 38;
const hexPath = `M ${gateX + hexInset} ${gateY} L ${gateX + gateW - hexInset} ${gateY} L ${gateX + gateW} ${gateY + gateH / 2} L ${gateX + gateW - hexInset} ${gateY + gateH} L ${gateX + hexInset} ${gateY + gateH} L ${gateX} ${gateY + gateH / 2} Z`;
out.push(`<path d="${hexPath}" fill="url(#gateGrad)" stroke="${c.gate}" stroke-width="3"/>`);

// v0.28 NEW badge
out.push(`<rect x="${gateX + gateW / 2 - 70}" y="${gateY - 18}" width="140" height="32" rx="16" fill="${c.gate}" stroke="${c.gateGlow}" stroke-width="1.5"/>`);
out.push(text(gateX + gateW / 2, gateY + 3, "★ v0.28 NEW", { size: 13, color: "#fff", weight: 800, letter: 1.5 }));

out.push(text(gateX + gateW / 2, gateY + 48, "MEASUREMENT QUALITY GATE", { size: 18, color: c.ink, weight: 800, letter: 1 }));
out.push(text(gateX + gateW / 2, gateY + 68, "the v0.28 punchline · was the case file clean?", { size: 11, color: c.gateGlow, italic: true }));

// Verdict states
const verdicts = [
  { label: "clean", color: c.out },
  { label: "input", color: c.gate },
  { label: "behavior", color: c.gate },
  { label: "compound", color: c.gate },
  { label: "insufficient", color: c.muted },
];
const vY = gateY + 92;
let vX = gateX + 30;
const vGap = 6;
const vAvailW = gateW - 60;
const vChipW = (vAvailW - vGap * (verdicts.length - 1)) / verdicts.length;
for (const v of verdicts) {
  out.push(`<rect x="${vX}" y="${vY}" width="${vChipW}" height="26" rx="13" fill="${c.panel}" stroke="${v.color}" stroke-width="1.5" opacity="0.95"/>`);
  out.push(text(vX + vChipW / 2, vY + 17, v.label, { size: 10, color: v.color, weight: 700 }));
  vX += vChipW + vGap;
}

out.push(text(gateX + gateW / 2, gateY + 148, "emit-only · cannot trigger replay, tournament, or block", { size: 11, color: c.muted, italic: true }));
out.push(text(gateX + gateW / 2, gateY + 164, "missing evidence → insufficient_evidence (fails closed, never silently clean)", { size: 10.5, color: c.faint, italic: true }));

// Gate-of-gate (bias monitor) below
const bmY = gateY + gateH + 28;
const bmW = 320;
const bmH = 60;
const bmX = (W - bmW) / 2;
out.push(box({ x: bmX, y: bmY, w: bmW, h: bmH, fill: c.gateFill, stroke: c.gate, rx: 8, strokeW: 1.5, dash: true }));
out.push(text(bmX + bmW / 2, bmY + 24, "gate-of-gate · bias monitor", { size: 13, color: c.ink, weight: 700 }));
out.push(text(bmX + bmW / 2, bmY + 44, "per-candidate skew detector · emit-only", { size: 11, color: c.muted, italic: true }));

// Connect gate to bias monitor
out.push(`<line x1="${W / 2}" y1="${gateY + gateH}" x2="${W / 2}" y2="${bmY}" stroke="${c.gate}" stroke-width="2" marker-end="url(#arrowGate)" opacity="0.7"/>`);

// ---------- Arrows: Lane A & B converge to gate ----------
// Lane A → gate (left side)
const aOutY = laY + laH;
const aOutX = mainX + laneW * 0.5;
const gateLeftX = gateX + 20;
const gateInY = gateY + gateH / 2;
out.push(curve(`M ${aOutX} ${aOutY} C ${aOutX} ${aOutY + 30}, ${gateLeftX - 60} ${gateInY - 20}, ${gateLeftX} ${gateInY}`, {
  color: c.laneA, w: 2.4, marker: "arrow",
  label: "evidence packet", labelX: aOutX + 60, labelY: aOutY + 35,
}));

// Lane B → gate (right side)
const bOutY = laY + 80 + 4 * lbNodeH + 3 * lbGap;
const bOutX = lbX + laneW * 0.5;
const gateRightX = gateX + gateW - 20;
out.push(curve(`M ${bOutX} ${bOutY} C ${bOutX} ${bOutY + 60}, ${gateRightX + 60} ${gateInY - 20}, ${gateRightX} ${gateInY}`, {
  color: c.laneB, w: 2.4, marker: "arrow",
  label: "measurement digest", labelX: bOutX - 70, labelY: bOutY + 50,
}));

// ---------- Output streams ----------
const outY = bmY + bmH + 50;
const outH = 90;
const outFullW = mainW;
const outStreamX = mainX;
out.push(box({ x: outStreamX, y: outY, w: outFullW, h: outH, fill: c.outFill, stroke: c.out, rx: 12, strokeW: 1.5 }));
out.push(text(outStreamX + 20, outY + 24, "OUTPUT · schema-locked disjoint streams", { size: 11, color: c.out, weight: 800, anchor: "start", letter: 1.5 }));

const streams = [
  { name: "observability_stream", sub: "emit-only diagnostics" },
  { name: "work_order_stream", sub: "replay-required" },
  { name: "evolution_candidates", sub: "tournament input" },
];
const streamW = (outFullW - 80) / 3;
let osx = outStreamX + 20;
for (const s of streams) {
  out.push(`<rect x="${osx}" y="${outY + 36}" width="${streamW}" height="44" rx="8" fill="${c.panel}" stroke="${c.out}" stroke-width="1.2"/>`);
  out.push(text(osx + streamW / 2, outY + 56, s.name, { size: 13, color: c.ink, weight: 700 }));
  out.push(text(osx + streamW / 2, outY + 73, s.sub, { size: 10.5, color: c.muted, italic: true }));
  osx += streamW + 10;
}

// Gate / bias monitor → observability_stream
out.push(arrow(W / 2, bmY + bmH, outStreamX + 20 + streamW / 2, outY + 36, {
  color: c.muted, w: 1.8, dash: true, marker: "arrowMuted",
  label: "verdict + bias",
}));

// Lane A replay synthesis → work_order + evolution_candidates
const a5x = mainX + laneW * 0.5;
const a5y = laY + 80 + 5 * laNodeH + 4 * laGap;
out.push(curve(`M ${a5x} ${a5y} C ${a5x} ${a5y + 200}, ${outStreamX + 30 + streamW * 1.5} ${outY + 10}, ${outStreamX + 30 + streamW + streamW / 2} ${outY + 36}`, {
  color: c.laneA, w: 2, marker: "arrow",
  label: "candidate packet", labelX: a5x + 120, labelY: a5y + 90,
}));
out.push(curve(`M ${a5x} ${a5y} C ${a5x + 50} ${a5y + 180}, ${outStreamX + 30 + streamW * 2.5} ${outY + 5}, ${outStreamX + 30 + streamW * 2 + streamW / 2} ${outY + 36}`, {
  color: c.laneA, w: 2, marker: "arrow", dash: true,
}));

// ---------- L0 → main area (constraint envelope) ----------
out.push(`<line x1="${schemaX + schemaW}" y1="${laY + 80}" x2="${mainX - 8}" y2="${laY + 80}" stroke="${c.schema}" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/>`);
out.push(text(schemaX + schemaW + (mainX - schemaX - schemaW) / 2, laY + 73, "enforces", { size: 9.5, color: c.schema, italic: true }));

out.push(`<line x1="${schemaX + schemaW}" y1="${gateY + gateH / 2}" x2="${gateX - 8}" y2="${gateY + gateH / 2}" stroke="${c.schema}" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/>`);
out.push(text(schemaX + schemaW + (gateX - schemaX - schemaW - 10) / 2, gateY + gateH / 2 - 6, "enforces", { size: 9.5, color: c.schema, italic: true }));

out.push(`<line x1="${schemaX + schemaW}" y1="${outY + outH / 2}" x2="${outStreamX - 8}" y2="${outY + outH / 2}" stroke="${c.schema}" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/>`);
out.push(text(schemaX + schemaW + (outStreamX - schemaX - schemaW - 10) / 2, outY + outH / 2 - 6, "enforces", { size: 9.5, color: c.schema, italic: true }));

// ---------- Output → BLOCKED (cannot reach) ----------
out.push(`<line x1="${outStreamX + outFullW + 8}" y1="${outY + outH / 2}" x2="${blkX - 8}" y2="${outY + outH / 2}" stroke="${c.blocked}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`);
out.push(text(outStreamX + outFullW + (blkX - outStreamX - outFullW) / 2, outY + outH / 2 - 6, "cannot reach", { size: 9.5, color: c.blocked, italic: true, weight: 600 }));

// ---------- Footer punchline ----------
const footY = H - 50;
out.push(`<rect x="40" y="${footY - 8}" width="${W - 80}" height="40" rx="10" fill="${c.panelHi}" stroke="${c.cyan}" stroke-width="1" opacity="0.6"/>`);
out.push(text(W / 2, footY + 18, "no measurement → no evolution claim    ·    no clean measurement → no candidate judgment    ·    no human boundary → no live authority", { size: 11.5, color: c.inkDim, weight: 600, italic: true, letter: 0.4 }));

out.push(`</svg>`);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${out.join("\n")}\n`);

console.log(`Rendered ${path.relative(root, outputPath)} (${out.join("\n").length} bytes)`);
