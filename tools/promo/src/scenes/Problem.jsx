import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";

const BRAND = {
  bg: "#0b1220",
  fg: "#f5f7fb",
  muted: "#94a3b8",
  accent: "#1f6feb",
  warn: "#f59e0b",
  danger: "#dc2626",
  card: "#1e293b"
};

// Scene 1 — Problem (10s @ 30fps = 300 frames)
//   0-30  : kicker fade in
//   30-180: three protection layers slide in one by one (30f apart) + settle
//   180-210: "All depend on URL reputation" callout under the three
//   210-300: "Zero-hour phishing slips through" — fresh URL appears with clock, gap callout
export const Problem = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = STRINGS[lang];

  const kickerOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  const layerEnter = (startFrame) => {
    const k = spring({ frame: frame - startFrame, fps, config: { damping: 20 } });
    return {
      opacity: k,
      transform: `translateX(${(1 - k) * -40}px)`
    };
  };

  const commonAt = 180;
  const commonOpacity = interpolate(frame, [commonAt, commonAt + 20], [0, 1], { extrapolateRight: "clamp" });

  const gapAt = 210;
  const gapOpacity = interpolate(frame, [gapAt, gapAt + 20], [0, 1], { extrapolateRight: "clamp" });
  // Fade the existing three layers + common label slightly when gap appears, to direct attention
  const dimAfterGap = interpolate(frame, [gapAt, gapAt + 30], [1, 0.35], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: BRAND.bg, padding: 80, color: BRAND.fg, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ fontSize: 22, color: BRAND.accent, fontWeight: 600, letterSpacing: 1, opacity: kickerOpacity, marginBottom: 28 }}>
        {s.problem_kicker.toUpperCase()}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: dimAfterGap }}>
        {[s.problem_layer1, s.problem_layer2, s.problem_layer3].map((label, i) => {
          const style = layerEnter(40 + i * 30);
          return (
            <div key={i} style={{
              ...style,
              background: BRAND.card,
              borderRadius: 12,
              padding: "18px 24px",
              fontSize: 30,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 18,
              width: 720
            }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: BRAND.muted }} />
              {label}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 28,
        fontSize: 22,
        color: BRAND.muted,
        opacity: commonOpacity * dimAfterGap,
        fontStyle: "italic"
      }}>
        — {s.problem_common}
      </div>

      <div style={{ opacity: gapOpacity, marginTop: 50, borderTop: `1px solid ${BRAND.muted}33`, paddingTop: 28 }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: BRAND.warn, marginBottom: 12 }}>
          {s.problem_gap_title}
        </div>
        <div style={{ fontSize: 22, color: BRAND.muted }}>
          {s.problem_gap_sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};
