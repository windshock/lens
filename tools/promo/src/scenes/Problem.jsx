import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";
import { useScale } from "../scale.js";

const BRAND = {
  bg: "#0b1220",
  fg: "#f5f7fb",
  muted: "#94a3b8",
  accent: "#1f6feb",
  warn: "#f59e0b",
  danger: "#dc2626",
  card: "#1e293b",
  cardBorder: "#334155"
};

const PHISHING_URL = "microsft-365-signin.workers.dev";

// Three reputation lookups, staggered. Each panel:
//   appears (spring) at appearAt, runs spinner, then reveals "Not on list" badge at resultAt.
const PANEL_TIMING = [
  { layerKey: "problem_layer1", appearAt: 50,  resultAt: 130 },
  { layerKey: "problem_layer2", appearAt: 80,  resultAt: 160 },
  { layerKey: "problem_layer3", appearAt: 110, resultAt: 190 },
];

function ReputationPanel({ name, appearAt, resultAt, frame, fps, s, queryText, notOnListText }) {
  const appear = spring({ frame: frame - appearAt, fps, config: { damping: 18 } });
  const opacity = interpolate(appear, [0, 1], [0, 1]);
  const translateY = interpolate(appear, [0, 1], [24 * s, 0]);

  const showResult = frame >= resultAt;
  const resultAppear = showResult
    ? spring({ frame: frame - resultAt, fps, config: { damping: 22 } })
    : 0;
  const resultScale = interpolate(resultAppear, [0, 1], [0.85, 1]);

  // 회전하는 spinner ring — result 가 나오기 전까지만.
  const spinnerAngle = ((frame - appearAt) * 8) % 360;
  const spinnerOpacity = showResult ? 0 : 1;

  return (
    <div style={{
      flex: 1,
      background: BRAND.card,
      borderRadius: 14 * s,
      padding: 22 * s,
      opacity,
      transform: `translateY(${translateY}px)`,
      border: `${2 * s}px solid ${showResult ? BRAND.danger : BRAND.cardBorder}`,
      transition: "border-color 0.3s ease-out",
    }}>
      <div style={{
        fontSize: 20 * s,
        fontWeight: 700,
        color: BRAND.fg,
        marginBottom: 14 * s,
      }}>{name}</div>
      <div style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13 * s,
        color: BRAND.muted,
        marginBottom: 16 * s,
        height: 16 * s,
      }}>{queryText}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 * s, height: 36 * s }}>
        {/* Spinner */}
        <div style={{
          width: 22 * s,
          height: 22 * s,
          borderRadius: 11 * s,
          border: `${3 * s}px solid ${BRAND.cardBorder}`,
          borderTopColor: BRAND.accent,
          opacity: spinnerOpacity,
          transform: `rotate(${spinnerAngle}deg)`,
          flexShrink: 0,
        }} />
        {/* Result badge */}
        <div style={{
          opacity: resultAppear,
          transform: `scale(${resultScale})`,
          background: BRAND.danger,
          color: "#fff",
          padding: `${8 * s}px ${14 * s}px`,
          borderRadius: 8 * s,
          fontSize: 16 * s,
          fontWeight: 700,
          letterSpacing: 0.3,
          display: "inline-flex",
          alignItems: "center",
          gap: 6 * s,
        }}>
          <span style={{ fontSize: 18 * s, lineHeight: 1 }}>✕</span>
          {notOnListText}
        </div>
      </div>
    </div>
  );
}

// Scene 1 — Problem (10s @ 30fps = 300 frames)
//   0-20    : kicker fade in
//   15-45   : phishing URL bar pops in with "created 2 hours ago"
//   50-220  : 3 reputation panels appear (50/80/110), each transitions to "Not on list" at 130/160/190
//   220-300 : "Zero-hour phishing slips through" gap message reveal
export const Problem = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useScale();
  const str = STRINGS[lang];

  const kickerOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const urlAppear = spring({ frame: frame - 15, fps, config: { damping: 16 } });
  const urlOpacity = interpolate(urlAppear, [0, 1], [0, 1]);
  const urlScale = interpolate(urlAppear, [0, 1], [0.95, 1]);

  const gapAppear = spring({ frame: frame - 220, fps, config: { damping: 16 } });
  const gapOpacity = interpolate(gapAppear, [0, 1], [0, 1]);
  const gapY = interpolate(gapAppear, [0, 1], [16 * s, 0]);

  return (
    <AbsoluteFill style={{
      background: BRAND.bg,
      padding: 80 * s,
      color: BRAND.fg,
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        fontSize: 22 * s,
        color: BRAND.accent,
        fontWeight: 600,
        letterSpacing: 1.2,
        opacity: kickerOpacity,
        marginBottom: 36 * s,
      }}>
        {str.problem_kicker.toUpperCase()}
      </div>

      {/* Phishing URL bar */}
      <div style={{
        opacity: urlOpacity,
        transform: `scale(${urlScale})`,
        background: "#1e293b",
        border: `${2 * s}px solid ${BRAND.danger}55`,
        borderRadius: 12 * s,
        padding: `${20 * s}px ${28 * s}px`,
        display: "flex",
        alignItems: "center",
        gap: 18 * s,
        marginBottom: 40 * s,
      }}>
        <div style={{
          width: 14 * s,
          height: 14 * s,
          borderRadius: 7 * s,
          background: BRAND.danger,
          boxShadow: `0 0 ${12 * s}px ${BRAND.danger}aa`,
          flexShrink: 0,
        }} />
        <div style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 28 * s,
          fontWeight: 600,
          color: BRAND.fg,
          flex: 1,
          letterSpacing: 0.3,
        }}>
          {PHISHING_URL}
        </div>
        <div style={{
          fontSize: 16 * s,
          color: BRAND.warn,
          fontWeight: 700,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}>
          {str.problem_url_age}
        </div>
      </div>

      {/* 3 reputation panels in a row */}
      <div style={{
        display: "flex",
        gap: 16 * s,
        marginBottom: 36 * s,
      }}>
        {PANEL_TIMING.map((p, i) => (
          <ReputationPanel
            key={i}
            name={str[p.layerKey]}
            appearAt={p.appearAt}
            resultAt={p.resultAt}
            frame={frame}
            fps={fps}
            s={s}
            queryText={str.problem_query}
            notOnListText={str.problem_not_on_list}
          />
        ))}
      </div>

      {/* Zero-hour gap message */}
      <div style={{
        opacity: gapOpacity,
        transform: `translateY(${gapY}px)`,
        marginTop: "auto",
      }}>
        <div style={{
          fontSize: 42 * s,
          fontWeight: 800,
          color: BRAND.warn,
          marginBottom: 10 * s,
          letterSpacing: -0.5,
        }}>
          {str.problem_gap_title}
        </div>
        <div style={{
          fontSize: 22 * s,
          color: BRAND.muted,
        }}>
          {str.problem_gap_sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};
