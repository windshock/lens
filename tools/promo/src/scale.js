// Layout scale helper — scenes design against 1280×720; multiply absolute sizes by
// the ratio between the composition width and 1280 to keep visuals proportional
// at any output resolution (e.g. 1.5x at 1920×1080).
//
// Usage:
//   import { useScale } from "../scale.js";
//   const s = useScale();        // 1.0 at 1280, 1.5 at 1920
//   <div style={{ fontSize: 22 * s, padding: 16 * s }} />
//
// All sub-pixel results are fine — CSS / Skia rounds them sensibly.

import { useVideoConfig } from "remotion";

const DESIGN_WIDTH = 1280;

export function useScale() {
  const { width } = useVideoConfig();
  return width / DESIGN_WIDTH;
}
