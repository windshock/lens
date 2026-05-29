import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { STRINGS } from "../i18n.js";

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
  const { fps } = useVideoConfig();
  const s = STRINGS[lang];

  const urlBarOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // popup slide down
  const popupSpring = spring({ frame: frame - 30, fps, config: { damping: 16 } });
  const popupOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateRight: "clamp" });

  // scan ticker — 3 stages over 30-90
  const tickerStage = interpolate(frame, [30, 90], [0, 3], { extrapolateRight: "clamp" });
  const tickerLabels = ["Loading page…", "DOM · OCR · WHOIS…", "Model inference…"];
  const tickerLabel = tickerLabels[Math.min(2, Math.floor(tickerStage))];

  // verdict reveal at frame 90
  const verdictAppear = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });

  // warning overlay slides up at frame 150
  const warnSpring = spring({ frame: frame - 150, fps, config: { damping: 20, stiffness: 100 } });
  const warnTranslate = interpolate(warnSpring, [0, 1], [720, 0]);

  return (
    <AbsoluteFill style={{ background: BRAND.bg, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: BRAND.fg }}>
      {/* Fake browser chrome */}
      <div style={{
        background: "#1e293b",
        padding: "14px 24px",
        opacity: urlBarOpacity,
        display: "flex",
        alignItems: "center",
        gap: 14
      }}>
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: "#ef4444" }} />
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: "#f59e0b" }} />
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: "#10b981" }} />
        <div style={{
          flex: 1,
          marginLeft: 18,
          background: "#0b1220",
          borderRadius: 8,
          padding: "10px 18px",
          fontSize: 18,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: BRAND.muted
        }}>
          https://<span style={{ color: BRAND.danger, fontWeight: 700 }}>{s.verdict_url}</span>/login
        </div>
      </div>

      {/* Fake login page placeholder */}
      <div style={{
        flex: 1,
        background: "#f8fafc",
        padding: 60,
        opacity: urlBarOpacity * (1 - Math.max(0, (warnSpring))),
        position: "relative"
      }}>
        <div style={{ fontSize: 38, fontWeight: 700, color: "#0b1220", marginBottom: 30 }}>
          Sign in to Microsoft
        </div>
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "24px 28px",
          maxWidth: 460,
          color: "#0b1220"
        }}>
          <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 10 }}>Email</div>
          <div style={{ height: 38, background: "#f3f4f6", borderRadius: 6, marginBottom: 18 }} />
          <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 10 }}>Password</div>
          <div style={{ height: 38, background: "#f3f4f6", borderRadius: 6 }} />
        </div>

        {/* Popup overlay on the right */}
        <div style={{
          position: "absolute",
          right: 60,
          top: -10 + popupSpring * 50,
          width: 360,
          background: "#fff",
          color: "#0b1220",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
          padding: 18,
          opacity: popupOpacity
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Phishing Link Scanner</div>
          <div style={{
            background: verdictAppear > 0.1 ? BRAND.cardBg : "#d1fae5",
            color: verdictAppear > 0.1 ? BRAND.cardFg : "#064e3b",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 10,
            transition: "all 0.3s"
          }}>
            {verdictAppear > 0.1 ? `Phishing suspected · ${s.verdict_score} · Microsoft` : tickerLabel}
          </div>
          {verdictAppear > 0.3 && (
            <div style={{ fontSize: 12, color: BRAND.cardFg, opacity: verdictAppear, lineHeight: 1.5 }}>
              Brand-domain mismatch — page is <strong>{s.verdict_url}</strong> not microsoft.com. Credential form detected.
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
          gap: 22,
          padding: 60
        }}>
          <svg width="100" height="100" viewBox="0 0 64 64" fill="none">
            <path d="M32 6 8 14v18c0 16 11 26 24 32 13-6 24-16 24-32V14L32 6Z" stroke="white" strokeWidth="3" fill="none" />
            <path d="M22 22l20 20M42 22l-20 20" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 52, fontWeight: 800, textAlign: "center" }}>
            {s.verdict_action}
          </div>
          <div style={{ fontSize: 24, color: "#fecaca", textAlign: "center", maxWidth: 720 }}>
            {s.verdict_brand} · {s.verdict_score}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
