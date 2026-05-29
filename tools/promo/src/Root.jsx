import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo.jsx";

// 30s × 30fps = 900 frames. 1280×720 (YouTube 720p).
const SHARED = {
  component: PromoVideo,
  durationInFrames: 900,
  fps: 30,
  width: 1280,
  height: 720,
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
