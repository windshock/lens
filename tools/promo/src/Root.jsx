import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo.jsx";

// 30s × 30fps = 900 frames. 1920×1080 (YouTube 1080p).
// Internal scene layouts are written against a logical 1280×720 design space and
// receive a scale factor from useVideoConfig so all spacing/typography scales
// proportionally as the composition size changes.
const SHARED = {
  component: PromoVideo,
  durationInFrames: 900,
  fps: 30,
  width: 1920,
  height: 1080,
};

export const Root = () => {
  return (
    <>
      <Composition
        id="PromoEN"
        {...SHARED}
        defaultProps={{ lang: "en" }}
      />
      <Composition
        id="PromoKO"
        {...SHARED}
        defaultProps={{ lang: "ko" }}
      />
    </>
  );
};
