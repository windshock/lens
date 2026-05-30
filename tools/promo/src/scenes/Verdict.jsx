import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";
import { useScale } from "../scale.js";

const BRAND = {
  bg: "#0b1220",
  fg: "#f5f7fb",
  muted: "#94a3b8",
  accent: "#1f6feb",
  danger: "#dc2626",
  dangerSoft: "#7f1d1d",
  white: "#ffffff",
  cardBg: "#fee2e2",
  cardFg: "#7f1d1d"
};

// Scene 3 — Verdict (7s @ 30fps = 210 frames)
//   0-30   : URL bar shows the fake URL, page background fades in
//   30-90  : popup slides down + scan ticker progresses
//   90-150 : verdict pops to danger (9/10 Microsoft)
//   150-210: full-screen warning overlay slides in from below
export const Verdict = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useScale();
  const str = STRINGS[lang];

  const urlBarOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const popupSpring = spring({ frame: frame - 30, fps, config: { damping: 16 } });
  const popupOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateRight: "clamp" });

  const tickerStage = interpolate(frame, [30, 90], [0, 3], { extrapolateRight: "clamp" });
  const tickerLabels = ["Loading page…", "DOM · OCR · WHOIS…", "Model inference…"];
  const tickerLabel = tickerLabels[Math.min(2, Math.floor(tickerStage))];

  const verdictAppear = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });

  const warnSpring = spring({ frame: frame - 150, fps, config: { damping: 20, stiffness: 100 } });
  const warnTranslate = interpolate(warnSpring, [0, 1], [height, 0]);

  return (
    <AbsoluteFill style={{ background: BRAND.bg, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: BRAND.fg }}>
      {/* Fake browser chrome */}
      <div style={{
        background: "#1e293b",
        padding: `${14 * s}px ${24 * s}px`,
        opacity: urlBarOpacity,
        display: "flex",
        alignItems: "center",
        gap: 14 * s
      }}>
        <span style={{ display: "inline-block", width: 12 * s, height: 12 * s, borderRadius: 6 * s, background: "#ef4444" }} />
        <span style={{ display: "inline-block", width: 12 * s, height: 12 * s, borderRadius: 6 * s, background: "#f59e0b" }} />
        <span style={{ display: "inline-block", width: 12 * s, height: 12 * s, borderRadius: 6 * s, background: "#10b981" }} />
        <div style={{
          flex: 1,
          marginLeft: 18 * s,
          background: "#0b1220",
          borderRadius: 8 * s,
          padding: `${10 * s}px ${18 * s}px`,
          fontSize: 18 * s,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: BRAND.muted
        }}>
          https://<span style={{ color: BRAND.danger, fontWeight: 700 }}>{str.verdict_url}</span>/login
        </div>
      </div>

      {/* Fake login page placeholder */}
      <div style={{
        flex: 1,
        background: "#f8fafc",
        padding: 60 * s,
        opacity: urlBarOpacity * (1 - Math.max(0, warnSpring)),
        position: "relative"
      }}>
        <div style={{ fontSize: 38 * s, fontWeight: 700, color: "#0b1220", marginBottom: 30 * s }}>
          Sign in to Microsoft
        </div>
        <div style={{
          background: "#fff",
          border: `${1 * s}px solid #e5e7eb`,
          borderRadius: 10 * s,
          padding: `${24 * s}px ${28 * s}px`,
          maxWidth: 460 * s,
          color: "#0b1220"
        }}>
          <div style={{ fontSize: 16 * s, color: "#6b7280", marginBottom: 10 * s }}>Email</div>
          <div style={{ height: 38 * s, background: "#f3f4f6", borderRadius: 6 * s, marginBottom: 18 * s }} />
          <div style={{ fontSize: 16 * s, color: "#6b7280", marginBottom: 10 * s }}>Password</div>
          <div style={{ height: 38 * s, background: "#f3f4f6", borderRadius: 6 * s }} />
        </div>

        {/* Popup overlay on the right */}
        <div style={{
          position: "absolute",
          right: 60 * s,
          top: -10 * s + popupSpring * 50 * s,
          width: 360 * s,
          background: "#fff",
          color: "#0b1220",
          borderRadius: 14 * s,
          boxShadow: `0 ${20 * s}px ${60 * s}px rgba(15,23,42,0.25)`,
          padding: 18 * s,
          opacity: popupOpacity
        }}>
          <div style={{ fontSize: 14 * s, fontWeight: 700, marginBottom: 10 * s }}>Phishing Link Scanner</div>
          <div style={{
            background: verdictAppear > 0.1 ? BRAND.cardBg : "#d1fae5",
            color: verdictAppear > 0.1 ? BRAND.cardFg : "#064e3b",
            padding: `${8 * s}px ${12 * s}px`,
            borderRadius: 8 * s,
            fontSize: 13 * s,
            fontWeight: 600,
            marginBottom: 10 * s,
            transition: "all 0.3s"
          }}>
            {verdictAppear > 0.1 ? `Phishing suspected · ${str.verdict_score} · Microsoft` : tickerLabel}
          </div>
          {verdictAppear > 0.3 && (
            <div style={{ fontSize: 12 * s, color: BRAND.cardFg, opacity: verdictAppear, lineHeight: 1.5 }}>
              Brand-domain mismatch — page is <strong>{str.verdict_url}</strong> not microsoft.com. Credential form detected.
            </div>
          )}
        </div>
      </div>

      {/* Warning overlay slides up at end */}
      {frame >= 145 && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: BRAND.dangerSoft,
          color: BRAND.white,
          transform: `translateY(${warnTranslate}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22 * s,
          padding: 60 * s
        }}>
          <svg width={100 * s} height={100 * s} viewBox="0 0 64 64" fill="none">
            <path d="M32 6 8 14v18c0 16 11 26 24 32 13-6 24-16 24-32V14L32 6Z" stroke="white" strokeWidth="3" fill="none" />
            <path d="M22 22l20 20M42 22l-20 20" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 52 * s, fontWeight: 800, textAlign: "center" }}>
            {str.verdict_action}
          </div>
          <div style={{ fontSize: 24 * s, color: "#fecaca", textAlign: "center", maxWidth: 720 * s }}>
            {str.verdict_brand} · {str.verdict_score}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
