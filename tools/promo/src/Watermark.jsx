import React from "react";
import { AbsoluteFill } from "remotion";
import { useScale } from "./scale.js";

// 모든 씬 위에 합성되는 작은 우하단 워터마크. Pages URL.
// pointerEvents: none 으로 클릭 차단 안 함 (의미 없지만 관습).
export const Watermark = () => {
  const s = useScale();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute",
        right: 24 * s,
        bottom: 16 * s,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11 * s,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 0.5 * s,
      }}>
        windshock.github.io/lens
      </div>
    </AbsoluteFill>
  );
};
