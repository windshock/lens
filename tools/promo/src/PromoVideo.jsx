import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Problem } from "./scenes/Problem.jsx";
import { Solution } from "./scenes/Solution.jsx";
import { Verdict } from "./scenes/Verdict.jsx";
import { Outro } from "./scenes/Outro.jsx";
import { Watermark } from "./Watermark.jsx";

const TOTAL_FRAMES = 900;
const FADE_OUT_FRAMES = 20;

// 마지막 fade-to-black 은 outer composition 에서 글로벌 frame 으로 직접 보간.
// TransitionSeries.Sequence 내부의 useCurrentFrame 은 timing 시프트가 적용돼
// 안에서 fade 보간하기엔 신뢰성 떨어짐.
const FadeOutOverlay = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [TOTAL_FRAMES - FADE_OUT_FRAMES, TOTAL_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <AbsoluteFill style={{ background: "#000", opacity, pointerEvents: "none" }} />;
};

// Scene timeline (in frames, 30fps):
//   Problem  : 0   - 300   (10s)
//   Solution : 300 - 540   (8s)
//   Verdict  : 540 - 750   (7s)
//   Outro    : 750 - 900   (5s)
//
// 비주얼은 TransitionSeries 로 묶어 15프레임 cross-fade 로 씬 사이를 연결. 전환 시간은
// 앞/뒤 시퀀스 끝/시작에서 절반씩 흡수돼 총 길이는 변동 없음 (900 frames).
// 오디오는 별도 Sequence 트랙으로 두어 시각 전환과 무관하게 정확한 타이밍 유지.
// Watermark 는 모든 씬 위에 합성되는 최상위 레이어.

const TRANSITION_FRAMES = 15;

export const PromoVideo = ({ lang }) => {
  const audioFor = (scene) => staticFile(`audio/${scene}-${lang}.mp3`);

  return (
    <AbsoluteFill style={{ background: "#0b1220" }}>
      {/* BGM underlay — full composition at low volume so it doesn't compete with narration */}
      <Audio src={staticFile("audio/bgm.mp3")} volume={0.1} />

      {/* Audio track — independent of visual transitions */}
      <Sequence from={0} durationInFrames={300}>
        <Audio src={audioFor("scene1")} />
      </Sequence>
      <Sequence from={300} durationInFrames={240}>
        <Audio src={audioFor("scene2")} />
      </Sequence>
      <Sequence from={540} durationInFrames={210}>
        <Audio src={audioFor("scene3")} />
      </Sequence>
      <Sequence from={750} durationInFrames={150}>
        <Audio src={audioFor("scene4")} />
      </Sequence>

      {/* Visual track — TransitionSeries with cross-fade between scenes */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={300}>
          <Problem lang={lang} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={240}>
          <Solution lang={lang} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={210}>
          <Verdict lang={lang} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        {/* Outro duration = 150 visual budget + 45 frames absorbed by the three
            preceding cross-fades (each transition shifts the following sequence's
            actual render-start 15 frames earlier). 195 keeps the outro on-screen
            all the way to composition frame 900. */}
        <TransitionSeries.Sequence durationInFrames={195}>
          <Outro lang={lang} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Watermark on top of everything */}
      <Watermark />

      {/* Final fade-to-black — must come last so it covers Watermark too */}
      <FadeOutOverlay />
    </AbsoluteFill>
  );
};
