import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";
import { useScale } from "../scale.js";

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
  const s = useScale();
  const str = STRINGS[lang];

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 25], [20 * s, 0], { extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });

  const cardEnter = (startFrame) => {
    const k = spring({ frame: frame - startFrame, fps, config: { damping: 18 } });
    return {
      opacity: k,
      transform: `translateY(${(1 - k) * 24 * s}px)`
    };
  };

  const cards = [str.solution_step1, str.solution_step2, str.solution_step3, str.solution_step4];
  const accentCardIdx = 2; // "On-device Gemini Nano" 가 accent

  return (
    <AbsoluteFill style={{ background: BRAND.bg, padding: 80 * s, color: BRAND.fg, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        <div style={{ fontSize: 44 * s, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 * s }}>
          {str.solution_title}
        </div>
      </div>
      <div style={{
        opacity: subOpacity,
        fontSize: 26 * s,
        color: BRAND.accent,
        fontWeight: 600,
        marginBottom: 48 * s
      }}>
        {str.solution_sub}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 * s, maxWidth: 980 * s }}>
        {cards.map((label, i) => {
          const style = cardEnter(60 + i * 15);
          const isAccent = i === accentCardIdx;
          return (
            <div key={i} style={{
              ...style,
              background: isAccent ? BRAND.cardAccent : BRAND.card,
              border: isAccent ? `${2 * s}px solid ${BRAND.accent}` : `${2 * s}px solid transparent`,
              borderRadius: 14 * s,
              padding: `${22 * s}px ${28 * s}px`,
              fontSize: 26 * s,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 16 * s
            }}>
              <span style={{
                display: "inline-block",
                width: 12 * s,
                height: 12 * s,
                borderRadius: 6 * s,
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
