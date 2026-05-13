import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const flowStages = [
  {
    title: "Evidence",
    detail: "redacted runs, Hermes refs, audits",
    x: 96,
    y: 360,
    width: 188,
    color: "#64748b"
  },
  {
    title: "Distill + Map",
    detail: "segments, signals, local token refs",
    x: 330,
    y: 360,
    width: 208,
    color: "#0f766e"
  },
  {
    title: "Route Table",
    detail: "memory / skill / case / policy / damping",
    x: 586,
    y: 360,
    width: 228,
    color: "#059669"
  },
  {
    title: "Candidate Gates",
    detail: "minimal L3, preflight, repair tickets",
    x: 862,
    y: 360,
    width: 238,
    color: "#2563eb"
  },
  {
    title: "Tournament",
    detail: "strategy_fit + llm_review_value",
    x: 1148,
    y: 360,
    width: 238,
    color: "#7c3aed"
  }
];

const outputStages = [
  { title: "Draft Skill", detail: "local file only", x: 210, color: "#0f766e" },
  { title: "Repair Ticket", detail: "Codex work queue", x: 480, color: "#2563eb" },
  { title: "Work Order", detail: "primary-agent handoff", x: 750, color: "#f97316" },
  { title: "Human Boundary", detail: "approve / hold / reject", x: 1020, color: "#dc2626" }
];

const blockedItems = [
  "memory writes",
  "Skill install",
  "provider routes",
  "timers/services",
  "public posts",
  "VPS updates"
];

function fade(frame: number, start: number, duration: number) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  });
}

function StageCard({
  title,
  detail,
  x,
  y,
  width,
  color,
  delay
}: {
  title: string;
  detail: string;
  x: number;
  y: number;
  width: number;
  color: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const opacity = fade(frame, delay, 18);
  const translateY = interpolate(opacity, [0, 1], [18, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: 116,
        borderRadius: 14,
        background: "#ffffff",
        border: `2px solid ${color}`,
        boxShadow: "0 10px 26px rgba(15, 23, 42, 0.13)",
        opacity,
        transform: `translateY(${translateY}px)`,
        padding: "22px 22px",
        boxSizing: "border-box"
      }}
    >
      <div style={{ font: "700 24px Arial", color: "#111827" }}>{title}</div>
      <div style={{ font: "400 17px Arial", color: "#475569", marginTop: 10, lineHeight: 1.28 }}>
        {detail}
      </div>
    </div>
  );
}

function Arrow({ x, y, width = 38, delay }: { x: number; y: number; width?: number; delay: number }) {
  const frame = useCurrentFrame();
  return (
    <svg
      width={width}
      height="22"
      viewBox={`0 0 ${width} 22`}
      style={{ position: "absolute", left: x, top: y, opacity: fade(frame, delay, 14) }}
    >
      <path d={`M1 11 H${width - 14}`} stroke="#334155" strokeWidth="4" fill="none" />
      <path d={`M${width - 14} 3 L${width - 1} 11 L${width - 14} 19 Z`} fill="#334155" />
    </svg>
  );
}

function Lane({
  title,
  subtitle,
  top,
  height,
  color,
  background,
  delay
}: {
  title: string;
  subtitle: string;
  top: number;
  height: number;
  color: string;
  background: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        top,
        width: 1460,
        height,
        borderRadius: 18,
        background,
        border: `2px solid ${color}`,
        opacity: fade(frame, delay, 20),
        padding: "22px 26px",
        boxSizing: "border-box"
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 700, color }}>{title}</div>
      <div style={{ fontSize: 17, color: "#475569", marginTop: 10 }}>{subtitle}</div>
    </div>
  );
}

export const LangGraphQianxuesenFlow = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        width: 1600,
        height: 900,
        background: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111827"
      }}
    >
      <div style={{ position: "absolute", left: 80, top: 48, opacity: fade(frame, 0, fps * 0.6) }}>
        <div style={{ fontSize: 42, fontWeight: 700 }}>
          Misa Cybernetic Evolution Layer
        </div>
        <div style={{ fontSize: 22, color: "#475569", marginTop: 14 }}>
          A local control-theoretic sidecar: evidence in, safe drafts out, human boundary preserved.
        </div>
      </div>

      <Lane
        title="INPUT AND CARRIER LAYER"
        subtitle="LangGraph may carry state, checkpoints, interrupts, and resume traces. It does not own learning routes."
        top={145}
        height={132}
        color="#0369a1"
        background="#e0f2fe"
        delay={10}
      />

      <Lane
        title="QIANXUESEN CONTROL LAYER"
        subtitle="Deterministic route authority lives here: distill, split, route, gate, compare, and keep live effects off."
        top={315}
        height={205}
        color="#047857"
        background="#ecfdf5"
        delay={18}
      />

      <Lane
        title="OUTPUT AND HUMAN BOUNDARY"
        subtitle="Outputs are local drafts or handoff packets until a human explicitly approves a durable or public effect."
        top={575}
        height={178}
        color="#c2410c"
        background="#fff7ed"
        delay={26}
      />

      {flowStages.map((stage, index) => (
        <StageCard key={stage.title} {...stage} delay={34 + index * 8} />
      ))}
      {[292, 548, 824, 1110].map((x, index) => (
        <Arrow key={x} x={x} y={406} width={34} delay={44 + index * 8} />
      ))}

      {outputStages.map((stage, index) => (
        <StageCard
          key={stage.title}
          title={stage.title}
          detail={stage.detail}
          x={stage.x}
          y={630}
          width={210}
          color={stage.color}
          delay={80 + index * 8}
        />
      ))}
      {[430, 700, 970].map((x, index) => (
        <Arrow key={x} x={x} y={676} width={38} delay={88 + index * 8} />
      ))}

      <div
        style={{
          position: "absolute",
          left: 1195,
          top: 158,
          width: 280,
          height: 94,
          borderRadius: 14,
          background: "#ffffff",
          border: "2px solid #0369a1",
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
          opacity: fade(frame, 22, fps * 0.5),
          padding: "18px 20px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 700 }}>Carrier tools</div>
        <div style={{ fontSize: 16, color: "#475569", marginTop: 8 }}>
          state, checkpoint, interrupt, resume
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          top: 775,
          width: 1410,
          height: 70,
          borderRadius: 18,
          background: "#111827",
          color: "#ffffff",
          opacity: fade(frame, 116, fps * 0.5),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 30px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 700 }}>
          Blocked by default
        </div>
        {blockedItems.map((item) => (
          <div key={item} style={{ fontSize: 17, fontWeight: 700, color: "#fef2f2" }}>
            {item}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
