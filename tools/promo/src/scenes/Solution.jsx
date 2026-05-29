import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";

const BRAND = {
  bg: "#0b1220",
  fg: "#f5f7fb",
  muted: "#94a3b8",
  accent: "#1f6feb",
  card: "#1e293b",
  cardAccent: "#172554"
};

// Scene 2 — Solution (8s @ 30fps = 240 frames)
//   0-30  : main title fade in
//   30-60 : "Not a blocklist." sub
//   60-180: 4 capability cards stagger in (15f apart)
//   180-240: settle + light pulse on the on-device card
export const Solution = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = STRINGS[lang];

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 25], [20, 0], { extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });

  const cardEnter = (startFrame) => {
    const k = spring({ frame: frame - startFrame, fps, config: { damping: 18 } });
    return {
      opacity: k,
      transform: `translateY(${(1 - k) * 24}px)`
    };
  };

  const cards = [s.solution_step1, s.solution_step2, s.solution_step3, s.solution_step4];
  const accentCardIdx = 2; // "On-device Gemini Nano" gets the accent treatment

  return (
    <AbsoluteFill style={{ background: BRAND.bg, padding: 80, color: BRAND.fg, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 }}>
          {s.solution_title}
        </div>
      </div>
      <div style={{
        opacity: subOpacity,
        fontSize: 26,
        color: BRAND.accent,
        fontWeight: 600,
        marginBottom: 48
      }}>
        {s.solution_sub}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 980 }}>
        {cards.map((label, i) => {
          const style = cardEnter(60 + i * 15);
          const isAccent = i === accentCardIdx;
          return (
            <div key={i} style={{
              ...style,
              background: isAccent ? BRAND.cardAccent : BRAND.card,
              border: isAccent ? `2px solid ${BRAND.accent}` : "2px solid transparent",
              borderRadius: 14,
              padding: "22px 28px",
              fontSize: 26,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 16
            }}>
              <span style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 6,
                background: isAccent ? BRAND.accent : BRAND.muted
              }} />
              {label}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
