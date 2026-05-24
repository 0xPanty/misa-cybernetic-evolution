import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(
  root,
  "docs",
  "assets",
  "misa-cybernetic-evolution-v0.28.svg",
);

const W = 1500;
const H = 2180;

const color = {
  bg: "#07111f",
  grid: "#20314a",
  panel: "#0f1b2d",
  panel2: "#111f34",
  line: "#53657f",
  text: "#f8fafc",
  muted: "#9ca3af",
  blue: "#38bdf8",
  blue2: "#0b2a45",
  purple: "#a78bfa",
  purple2: "#22183a",
  red: "#fb3b64",
  red2: "#351024",
  green: "#10b981",
  green2: "#08271d",
  amber: "#f59e0b",
  amber2: "#2c1d08",
  orange: "#fb923c",
  orange2: "#2b1608",
  gray: "#94a3b8",
  gray2: "#151d2b",
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function t(x, y, value, opt = {}) {
  const {
    size = 18,
    fill = color.text,
    weight = 500,
    anchor = "middle",
    italic = false,
    letter = 0,
  } = opt;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="Inter, Segoe UI, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ""}${letter ? ` letter-spacing="${letter}"` : ""}>${esc(value)}</text>`;
}

function lines(x, y, values, opt = {}) {
  const { size = 16, gap = 20 } = opt;
  return values
    .map((value, index) => t(x, y + index * gap, value, { ...opt, size }))
    .join("\n");
}

function rect(x, y, w, h, opt = {}) {
  const {
    fill = color.panel,
    stroke = color.line,
    sw = 1.4,
    rx = 4,
    dash = false,
    opacity = 1,
  } = opt;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${dash ? ' stroke-dasharray="7 6"' : ""}/>`;
}

function box(x, y, w, h, title, sub = [], opt = {}) {
  const {
    fill = color.panel,
    stroke = color.blue,
    titleSize = 18,
    subSize = 14,
    rx = 4,
    dash = false,
  } = opt;
  const titleY = sub.length ? y + 30 : y + h / 2 + 6;
  const subY = y + 54;
  return `<g>
${rect(x, y, w, h, { fill, stroke, rx, dash, sw: opt.sw || 1.5 })}
${t(x + w / 2, titleY, title, { size: titleSize, weight: 750 })}
${sub.length ? lines(x + w / 2, subY, sub, { size: subSize, fill: opt.subFill || color.muted, italic: true, gap: subSize + 5 }) : ""}
</g>`;
}

function section(x, y, w, h, title, opt = {}) {
  const {
    fill = "rgba(15,27,45,0.56)",
    stroke = color.line,
    label = color.blue,
  } = opt;
  return `<g>
${rect(x, y, w, h, { fill, stroke, rx: 2, sw: 1.2, opacity: 0.95 })}
${t(x + 18, y + 24, title, { size: 15, fill: label, weight: 800, anchor: "start", letter: 1.2 })}
</g>`;
}

function arrow(x1, y1, x2, y2, opt = {}) {
  const { stroke = color.line, dash = false, sw = 1.8, end = "arrow" } = opt;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ' stroke-dasharray="7 7"' : ""} marker-end="url(#${end})"/>`;
}

function curve(d, opt = {}) {
  const { stroke = color.line, dash = false, sw = 1.6, end = "arrow" } = opt;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ' stroke-dasharray="7 7"' : ""} marker-end="url(#${end})"/>`;
}

const out = [];

out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
<title id="title">Misa 控制论进化层 v0.28 架构</title>
<desc id="desc">两条证据线进入测量质量闸门、L0-L4 控制链、L3 反哺和人类边界决策输出。</desc>
<defs>
  <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
    <path d="M1,1 L9,5 L1,9 Z" fill="${color.line}"/>
  </marker>
  <marker id="arrowBlue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
    <path d="M1,1 L9,5 L1,9 Z" fill="${color.blue}"/>
  </marker>
  <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
    <path d="M1,1 L9,5 L1,9 Z" fill="${color.red}"/>
  </marker>
  <marker id="arrowAmber" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
    <path d="M1,1 L9,5 L1,9 Z" fill="${color.amber}"/>
  </marker>
  <radialGradient id="gateGlow" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#fb3b64" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#fb3b64" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="${color.bg}"/>`);

out.push(`<g opacity="0.18">`);
for (let x = 0; x <= W; x += 50) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${color.grid}" stroke-width="1"/>`);
for (let y = 0; y <= H; y += 50) out.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${color.grid}" stroke-width="1"/>`);
out.push(`</g>`);

out.push(box(510, 58, 480, 70, "Misa 控制论进化层 v0.28", ["Hermes Agent 的测量优先控制闭环"], {
  fill: color.panel,
  stroke: color.blue,
  titleSize: 17,
  subSize: 13,
}));

// Signal intake.
out.push(section(70, 170, 980, 420, "信号输入 - 两条真实证据线", { stroke: color.line }));
out.push(section(110, 230, 360, 310, "A线 - 钱学森窗口蒸馏", { stroke: color.blue, label: color.blue }));
out.push(box(145, 275, 290, 58, "脱敏会话窗口", ["仅本地引用"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 13 }));
out.push(box(170, 370, 240, 72, "来源账本", ["检索链路", "Hermes 引用"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 12 }));
out.push(box(145, 480, 290, 58, "蒸馏 + 映射", ["片段 -> 信号"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 13 }));
out.push(arrow(290, 333, 290, 370, { stroke: color.blue, end: "arrowBlue" }));
out.push(arrow(290, 442, 290, 480, { stroke: color.blue, end: "arrowBlue" }));

out.push(section(520, 230, 490, 310, "B线 - Hermes 运行日志与模型 I/O", { stroke: color.purple, label: color.purple }));
out.push(box(550, 275, 190, 58, "运行日志", ["pre/post tool_call"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 13 }));
out.push(box(790, 275, 190, 58, "API 边界钩子", ["pre/post api_request"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 13 }));
out.push(box(550, 405, 190, 72, "动作监控", ["失败后重复", "查询熵"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 12 }));
out.push(box(790, 405, 190, 72, "模型 I/O tap", ["上下文字节", "只存哈希"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 12 }));
out.push(arrow(645, 333, 645, 405, { stroke: color.purple }));
out.push(arrow(885, 333, 885, 405, { stroke: color.purple }));

// Side blocked panel.
out.push(section(1110, 170, 310, 620, "默认阻断", { stroke: color.red, label: color.red, fill: "rgba(42,11,11,0.78)" }));
const blocked = [
  "写入 memory",
  "安装 / 发布 skill",
  "切换 provider 路由",
  "阻断 runtime",
  "公开发布",
  "VPS 自主更新",
  "Agent 自我裁判",
  "脏 telemetry 触发 replay",
  "LLM 决定路由 / 胜者",
];
let by = 235;
for (const item of blocked) {
  out.push(t(1150, by, "-", { size: 18, fill: color.red, anchor: "start", weight: 800 }));
  out.push(t(1175, by, item, { size: 14, fill: "#fecaca", anchor: "start", weight: 500 }));
  by += 48;
}

// Main vertical control chain.
out.push(section(330, 650, 500, 250, "L0 传感器契约 - 不信任无名信号", { stroke: color.gray, label: color.gray }));
out.push(box(385, 705, 390, 58, "Schema 锁", ["必须有 record_kind + signal_origin"], { stroke: color.gray, fill: color.gray2, titleSize: 15, subSize: 13 }));
out.push(box(385, 790, 390, 58, "脱敏边界", ["repo 不保存 raw prompt / token / tool args"], { stroke: color.gray, fill: color.gray2, titleSize: 15, subSize: 13 }));
out.push(arrow(580, 763, 580, 790));

out.push(section(330, 960, 500, 290, "L1 证据蒸馏 - 把窗口变成可控信号", { stroke: color.blue, label: color.blue }));
out.push(box(385, 1018, 390, 58, "窗口蒸馏器", ["压缩上下文熵"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 13 }));
out.push(box(385, 1102, 390, 58, "路由词表", ["memory / skill / case / policy / damping"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 13 }));
out.push(box(385, 1186, 390, 58, "候选门", ["minimal L3 / preflight / repair ticket"], { stroke: color.blue, fill: color.blue2, titleSize: 15, subSize: 13 }));
out.push(arrow(580, 1076, 580, 1102, { stroke: color.blue, end: "arrowBlue" }));
out.push(arrow(580, 1160, 580, 1186, { stroke: color.blue, end: "arrowBlue" }));

out.push(`<ellipse cx="580" cy="1378" rx="310" ry="78" fill="url(#gateGlow)"/>`);
out.push(box(280, 1300, 600, 156, "测量交叉验证", [
  "候选证据 + 动作监控 + 模型 I/O verdict",
  "先判断测量质量，不先评候选优劣",
  "脏 / 缺证据 -> 只进 observability",
], { stroke: color.red, fill: color.red2, titleSize: 20, subSize: 14, sw: 2.2 }));
out.push(box(395, 1486, 370, 58, "measurement_quality_gate", ["clean / input / behavior / compound / insufficient"], { stroke: color.red, fill: color.red2, titleSize: 15, subSize: 12 }));
out.push(box(395, 1570, 370, 58, "gate-of-gate 偏置监控", ["按候选统计偏斜 / 仅输出"], { stroke: color.red, fill: color.red2, titleSize: 15, subSize: 13, dash: true }));

out.push(section(170, 1685, 820, 150, "L2 验证 - 先失败闭合，再评候选", { stroke: color.purple, label: color.purple }));
out.push(box(205, 1735, 210, 58, "干净？", ["或证据不足"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 13 }));
out.push(box(475, 1735, 210, 58, "留出回放", ["确定性"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 13 }));
out.push(box(745, 1735, 210, 58, "Tournament 门", ["strategy_fit + value"], { stroke: color.purple, fill: color.purple2, titleSize: 15, subSize: 13 }));
out.push(arrow(415, 1764, 475, 1764, { stroke: color.purple }));
out.push(arrow(685, 1764, 745, 1764, { stroke: color.purple }));

out.push(section(170, 1890, 820, 150, "L3 路由反哺 - 安全压力，不自我改写", { stroke: color.amber, label: color.amber }));
out.push(box(205, 1940, 210, 58, "路由决策", ["memory / skill / case"], { stroke: color.amber, fill: color.amber2, titleSize: 15, subSize: 13 }));
out.push(box(475, 1940, 210, 58, "工单压力", ["repair / variants"], { stroke: color.amber, fill: color.amber2, titleSize: 15, subSize: 13 }));
out.push(box(745, 1940, 210, 58, "外环调节", ["setpoints / damping"], { stroke: color.amber, fill: color.amber2, titleSize: 15, subSize: 13 }));
out.push(arrow(415, 1969, 475, 1969, { stroke: color.amber, end: "arrowAmber" }));
out.push(arrow(685, 1969, 745, 1969, { stroke: color.amber, end: "arrowAmber" }));

out.push(section(1110, 850, 310, 265, "L4 人类决策", { stroke: color.orange, label: color.orange, fill: "rgba(43,22,8,0.72)" }));
out.push(box(1140, 905, 250, 54, "草案 / 修复工单", ["仅本地 artifact"], { stroke: color.orange, fill: color.orange2, titleSize: 14, subSize: 12 }));
out.push(box(1140, 986, 250, 54, "人类边界", ["批准 / 暂停 / 拒绝"], { stroke: color.orange, fill: color.orange2, titleSize: 14, subSize: 12 }));
out.push(box(1140, 1067, 250, 54, "上线后测量", ["正 / 负 / 空"], { stroke: color.orange, fill: color.orange2, titleSize: 14, subSize: 12 }));
out.push(arrow(1265, 959, 1265, 986, { stroke: color.orange }));
out.push(arrow(1265, 1040, 1265, 1067, { stroke: color.orange }));

out.push(section(1110, 1180, 310, 150, "输出流", { stroke: color.green, label: color.green, fill: "rgba(8,39,29,0.74)" }));
out.push(box(1135, 1226, 260, 36, "observability_stream", [], { stroke: color.green, fill: color.green2, titleSize: 13 }));
out.push(box(1135, 1274, 260, 36, "work_order_stream", [], { stroke: color.green, fill: color.green2, titleSize: 13 }));
out.push(box(1135, 1322, 260, 36, "evolution_candidates", [], { stroke: color.green, fill: color.green2, titleSize: 13 }));

// Primary arrows and feedback paths.
out.push(arrow(580, 590, 580, 650, { stroke: color.gray }));
out.push(arrow(580, 900, 580, 960, { stroke: color.blue, end: "arrowBlue" }));
out.push(arrow(580, 1250, 580, 1300, { stroke: color.red, end: "arrowRed" }));
out.push(arrow(580, 1456, 580, 1486, { stroke: color.red, end: "arrowRed" }));
out.push(arrow(580, 1628, 580, 1685, { stroke: color.purple }));
out.push(arrow(955, 1764, 990, 1764, { stroke: color.purple }));
out.push(curve("M 990 1764 C 1090 1640, 1035 930, 1140 932", { stroke: color.orange }));
out.push(curve("M 955 1969 C 1035 1810, 1035 1292, 1135 1292", { stroke: color.green }));
out.push(curve("M 955 1764 C 1035 1600, 1035 1340, 1135 1340", { stroke: color.green, dash: true }));
out.push(curve("M 1390 1094 C 1500 1320, 1320 1780, 955 1969", { stroke: color.amber, dash: true, end: "arrowAmber" }));

// Cross-lane inputs into measurement cross-check.
out.push(curve("M 290 538 C 250 770, 250 1190, 280 1378", { stroke: color.blue, dash: true, end: "arrowBlue" }));
out.push(curve("M 765 477 C 930 780, 930 1180, 880 1378", { stroke: color.purple, dash: true }));
out.push(curve("M 580 1544 C 900 1544, 1015 1378, 1110 640", { stroke: color.red, dash: true, end: "arrowRed" }));

out.push(t(875, 1510, "只输出 verdict，不能触发 replay", { size: 13, fill: color.red, anchor: "start", italic: true }));
out.push(t(1020, 1882, "L3 反哺收紧路由和修复提示", { size: 13, fill: color.amber, anchor: "start", italic: true }));

out.push(rect(60, 2125, 1380, 34, { fill: color.panel2, stroke: color.blue, rx: 6, opacity: 0.8 }));
out.push(t(750, 2148, "无测量 -> 无进化声明    ·    测量不干净 -> 不评候选    ·    无人类边界 -> 无 live authority", {
  size: 14,
  fill: color.muted,
  italic: true,
  weight: 700,
}));

out.push(`</svg>`);

const rendered = out.join("\n").replace(/[ \t]+$/gm, "");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${rendered}\n`);

console.log(`Rendered ${path.relative(root, outputPath)} (${rendered.length} bytes)`);
