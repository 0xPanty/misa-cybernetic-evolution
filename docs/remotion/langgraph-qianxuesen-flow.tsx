import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const stages = [
  { label: "Evidence", detail: "redacted refs", x: 105, stroke: "#94a3b8" },
  { label: "Distill", detail: "local signals", x: 350, stroke: "#10b981" },
  { label: "Route", detail: "memory / skill / case", x: 595, stroke: "#10b981" },
  { label: "Repair Ticket", detail: "local work queue", x: 840, stroke: "#10b981", width: 210 },
  { label: "Work Order", detail: "handoff packet", x: 1105, stroke: "#10b981", width: 210 }
];

const gateText = [
  "May explain, draft, or execute approved local work.",
  "Must not route learning, write memory, publish, or touch VPS."
];

function fade(frame: number, start: number, duration: number) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  });
}

function StageCard({
  label,
  detail,
  x,
  stroke,
  width = 190,
  delay
}: {
  label: string;
  detail: string;
  x: number;
  stroke: string;
  width?: number;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const opacity = fade(frame, delay, 18);
  const translateY = interpolate(opacity, [0, 1], [16, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 475,
        width,
        height: 96,
        borderRadius: 14,
        background: "#ffffff",
        border: `2px solid ${stroke}`,
        boxShadow: "0 10px 24px rgba(31, 41, 55, 0.14)",
        opacity,
        transform: `translateY(${translateY}px)`,
        padding: "26px 24px",
        boxSizing: "border-box"
      }}
    >
      <div style={{ font: "700 24px Arial", color: "#111827" }}>{label}</div>
      <div style={{ font: "400 18px Arial", color: "#475569", marginTop: 10 }}>{detail}</div>
    </div>
  );
}

function Arrow({ x, delay }: { x: number; delay: number }) {
  const frame = useCurrentFrame();
  const opacity = fade(frame, delay, 14);
  return (
    <svg
      width="58"
      height="20"
      viewBox="0 0 58 20"
      style={{ position: "absolute", left: x, top: 513, opacity }}
    >
      <path d="M1 10 H45" stroke="#334155" strokeWidth="4" fill="none" />
      <path d="M45 2 L57 10 L45 18 Z" fill="#334155" />
    </svg>
  );
}

export const LangGraphQianxuesenFlow = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOpacity = fade(frame, 0, fps * 0.7);
  const laneOpacity = fade(frame, 12, fps * 0.7);
  const gateOpacity = fade(frame, 82, fps * 0.6);

  return (
    <AbsoluteFill
      style={{
        width: 1600,
        height: 900,
        background: "linear-gradient(135deg, #f7fbff 0%, #f8fbf2 55%, #fff8ed 100%)",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111827"
      }}
    >
      <div style={{ position: "absolute", left: 80, top: 52, opacity: titleOpacity }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>
          LangGraph carries the loop. Qianxuesen owns the learning.
        </div>
        <div style={{ fontSize: 22, color: "#475569", marginTop: 16 }}>
          The bridge is a safe interface: graph mechanics in, deterministic control stays with Misa.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          top: 170,
          width: 1460,
          height: 150,
          borderRadius: 18,
          background: "rgba(224, 242, 254, 0.72)",
          border: "2px solid #0284c7",
          opacity: laneOpacity,
          padding: 25,
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#075985" }}>LANGGRAPH CARRIER LAYER</div>
        <div style={{ fontSize: 18, color: "#475569", marginTop: 18 }}>
          State container, checkpoint history, interrupt/resume, graph edges, execution trace
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          top: 360,
          width: 1460,
          height: 260,
          borderRadius: 18,
          background: "rgba(236, 253, 245, 0.78)",
          border: "2px solid #059669",
          opacity: laneOpacity,
          padding: 25,
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#065f46" }}>QIANXUESEN CONTROL LAYER</div>
        <div style={{ fontSize: 18, color: "#475569", marginTop: 18 }}>
          Deterministic distill, route, damping, repair tickets, work-order handoff, human boundary
        </div>
      </div>

      {stages.map((stage, index) => (
        <StageCard key={stage.label} {...stage} delay={24 + index * 10} />
      ))}
      {[295, 540, 785, 1050].map((x, index) => (
        <Arrow key={x} x={x} delay={34 + index * 10} />
      ))}

      <div
        style={{
          position: "absolute",
          left: 1045,
          top: 665,
          width: 290,
          height: 112,
          borderRadius: 16,
          background: "#fff7ed",
          border: "2px solid #f97316",
          boxShadow: "0 10px 24px rgba(31, 41, 55, 0.14)",
          opacity: fade(frame, 76, fps * 0.6),
          padding: 24,
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700 }}>LangGraph Interrupt</div>
        <div style={{ fontSize: 18, color: "#475569", marginTop: 12 }}>repair/work order stops here</div>
        <div style={{ fontSize: 18, color: "#475569", marginTop: 6 }}>resume needs human decision</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 450,
          top: 665,
          width: 500,
          height: 112,
          borderRadius: 16,
          background: "#fef2f2",
          border: "2px solid #ef4444",
          boxShadow: "0 10px 24px rgba(31, 41, 55, 0.14)",
          opacity: gateOpacity,
          padding: 24,
          boxSizing: "border-box"
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700 }}>LLM Agent Boundary</div>
        {gateText.map((text) => (
          <div key={text} style={{ fontSize: 19, fontWeight: 700, color: "#7f1d1d", marginTop: 9 }}>
            {text}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 95,
          top: 810,
          width: 1390,
          height: 52,
          borderRadius: 26,
          background: "#111827",
          opacity: fade(frame, 96, fps * 0.6),
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          paddingLeft: 40,
          boxSizing: "border-box"
        }}
      >
        Result: LangGraph gives durable workflow mechanics; Qianxuesen keeps the control-theory brain and human boundary.
      </div>
    </AbsoluteFill>
  );
};
