import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
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
// 각 씬은 자체 visual + audio (public/audio/scene{N}-<lang>.mp3) 를 가짐.
// Audio 는 Sequence 가 끝나면 자동 cut — script.json 의 텍스트가 씬 budget 보다
// 길어지면 mp3 가 잘리므로 tools/promo/scripts/generate-audio.sh 의 duration
// 보고를 보고 텍스트 또는 SAY_RATE 를 조정.

export const PromoVideo = ({ lang }) => {
  const audioFor = (scene) => staticFile(`audio/${scene}-${lang}.mp3`);

  return (
    <AbsoluteFill style={{ background: "#0b1220" }}>
      <Sequence from={0} durationInFrames={300}>
        <Audio src={audioFor("scene1")} />
        <Problem lang={lang} />
      </Sequence>
      <Sequence from={300} durationInFrames={240}>
        <Audio src={audioFor("scene2")} />
        <Solution lang={lang} />
      </Sequence>
      <Sequence from={540} durationInFrames={210}>
        <Audio src={audioFor("scene3")} />
        <Verdict lang={lang} />
      </Sequence>
      <Sequence from={750} durationInFrames={150}>
        <Audio src={audioFor("scene4")} />
        <Outro lang={lang} />
      </Sequence>
    </AbsoluteFill>
  );
};
