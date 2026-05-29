import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Problem } from "./scenes/Problem.jsx";
import { Solution } from "./scenes/Solution.jsx";
import { Verdict } from "./scenes/Verdict.jsx";
import { Outro } from "./scenes/Outro.jsx";

// Scene timeline (in frames, 30fps):
//   Problem  : 0   - 300   (10s)
//   Solution : 300 - 540   (8s)
//   Verdict  : 540 - 750   (7s)
//   Outro    : 750 - 900   (5s)
//
// Each <Sequence> mounts/unmounts at its boundary so internal useCurrentFrame()
// resets to 0 at the scene start.

export const PromoVideo = ({ lang }) => {
  return (
    <AbsoluteFill style={{ background: "#0b1220" }}>
      <Sequence from={0} durationInFrames={300}>
        <Problem lang={lang} />
      </Sequence>
      <Sequence from={300} durationInFrames={240}>
        <Solution lang={lang} />
      </Sequence>
      <Sequence from={540} durationInFrames={210}>
        <Verdict lang={lang} />
      </Sequence>
      <Sequence from={750} durationInFrames={150}>
        <Outro lang={lang} />
      </Sequence>
    </AbsoluteFill>
  );
};
