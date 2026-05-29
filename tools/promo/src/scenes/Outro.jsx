import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";

const BRAND = {
  bg: "#0b1220",
  fg: "#f5f7fb",
  muted: "#94a3b8",
  accent: "#1f6feb"
};

// Scene 4 — Outro (5s @ 30fps = 150 frames)
//   0-30  : "Windshock Lens" title scales in
//   30-90 : three taglines stagger in
//   90-150: URL highlight + subtle pulse
export const Outro = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = STRINGS[lang];

  const titleSpring = spring({ frame, fps, config: { damping: 14 } });
  const titleScale = interpolate(titleSpring, [0, 1], [0.8, 1]);

  const lineEnter = (startFrame) => {
    const k = spring({ frame: frame - startFrame, fps, config: { damping: 20 } });
    return { opacity: k, transform: `translateY(${(1 - k) * 14}px)` };
  };

  const urlPulse = 1 + Math.sin((frame - 90) / 8) * 0.02;

  return (
    <AbsoluteFill style={{
      background: BRAND.bg,
      color: BRAND.fg,
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 18
    }}>
      {/* Shield mark */}
      <svg width="80" height="80" viewBox="0 0 64 64" style={{ opacity: titleSpring }}>
        <rect width="64" height="64" rx="14" fill={BRAND.accent} />
        <path d="M18 22l9 9 19-19" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>

      <div style={{ fontSize: 68, fontWeight: 800, transform: `scale(${titleScale})`, opacity: titleSpring }}>
        {s.outro_title}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 24 }}>
        <div style={lineEnter(30)}>{s.outro_line1}</div>
        <div style={{ ...lineEnter(50), color: BRAND.muted }}>{s.outro_line2}</div>
        <div style={lineEnter(70)}>{s.outro_line3}</div>
      </div>

      <div style={{
        marginTop: 28,
        ...lineEnter(90),
        transform: `${lineEnter(90).transform} scale(${frame >= 90 ? urlPulse : 1})`,
        background: BRAND.accent,
        color: "#fff",
        padding: "14px 28px",
        borderRadius: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 22,
        fontWeight: 600
      }}>
        {s.outro_url}
      </div>
    </AbsoluteFill>
  );
};
