import React from "react";
import {
  driverLaunch,
  FACE_START_WEIGHT,
} from "../../simulate/launch-conditions";

// Three small diagrams of the club at impact that redraw as the controls
// move. Angles are drawn three times their real size so a 2° change is
// visible; the captions give the true numbers.
const EXAGGERATE = 3;
const FACE = "#ffffff";
const PATH = "#a3e635";
const START = "#fb923c";
const MUTED = "rgba(255,255,255,0.35)";

const round = (value) => Math.round(value * 10) / 10;

const Arrowheads = () => (
  <defs>
    {[
      ["face", FACE],
      ["path", PATH],
      ["start", START],
    ].map(([name, colour]) => (
      <marker
        key={name}
        id={`arrow-${name}`}
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill={colour} />
      </marker>
    ))}
  </defs>
);

const Card = ({ title, detail, label, children }) => (
  <figure className="hud-panel m-0 p-1.5">
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
      className="block w-full"
    >
      <Arrowheads />
      {children}
    </svg>
    <figcaption className="mt-0.5 text-center">
      <span className="block text-[10px] uppercase tracking-wider text-white/60">
        {title}
      </span>
      <span className="block whitespace-nowrap text-[11px] font-semibold tabular-nums">
        {detail}
      </span>
    </figcaption>
  </figure>
);

// Looking straight down. The target is up the page.
const TopView = ({ angles, golferSide, label, detail }) => (
  <Card title="From above" detail={detail} label={label}>
    {/* centre line of the range */}
    <line
      x1="60"
      y1="6"
      x2="60"
      y2="114"
      stroke={MUTED}
      strokeDasharray="3 4"
    />
    <g transform={`rotate(${angles.aim} 60 72)`}>
      {/* the line the golfer is aimed down */}
      <line x1="60" y1="72" x2="60" y2="10" stroke={MUTED} />
      <g data-arrow="path" transform={`rotate(${angles.path} 60 72)`}>
        <line
          x1="60"
          y1="112"
          x2="60"
          y2="92"
          stroke={PATH}
          strokeWidth="2.5"
          markerEnd="url(#arrow-path)"
        />
      </g>
      <g data-arrow="start" transform={`rotate(${angles.start} 60 72)`}>
        <line
          x1="60"
          y1="64"
          x2="60"
          y2="20"
          stroke={START}
          strokeWidth="2.5"
          markerEnd="url(#arrow-start)"
        />
      </g>
      <g data-arrow="face" transform={`rotate(${angles.face} 60 72)`}>
        <line
          x1="60"
          y1="64"
          x2="60"
          y2="38"
          stroke={FACE}
          strokeWidth="2"
          markerEnd="url(#arrow-face)"
        />
        {/* club head behind the ball, hosel and shaft on the golfer's side */}
        <rect
          x="44"
          y="77"
          width="32"
          height="10"
          rx="4"
          fill="#16181d"
          stroke={FACE}
        />
        <line
          x1={60 - golferSide * 16}
          y1="82"
          x2={60 - golferSide * 30}
          y2="86"
          stroke="#c9ced6"
          strokeWidth="2"
        />
      </g>
      <circle cx="60" cy="72" r="4" fill="#fff" />
    </g>
  </Card>
);

// Standing behind the ball looking at the target: arrows lie on the ground
// and run away toward the horizon.
const BehindView = ({ angles, golferSide, label, detail }) => {
  const horizon = 34;
  const ball = { x: 60, y: 88 };
  // where a line leaving the ball at this angle meets the horizon
  const toHorizon = (degrees, reach) => ({
    x:
      ball.x +
      (ball.y - horizon) * reach * Math.tan((degrees * Math.PI) / 180) * 1.4,
    y: ball.y - (ball.y - horizon) * reach,
  });
  const aimEnd = toHorizon(angles.aim, 1);
  const face = toHorizon(angles.aim + angles.face, 0.55);
  const start = toHorizon(angles.aim + angles.start, 0.9);
  const pathTo = toHorizon(angles.aim + angles.path, -0.3);
  const pathFrom = toHorizon(angles.aim + angles.path, -0.52);
  return (
    <Card title="From behind" detail={detail} label={label}>
      <line x1="4" y1={horizon} x2="116" y2={horizon} stroke={MUTED} />
      <line
        x1={ball.x}
        y1="116"
        x2={ball.x}
        y2={horizon}
        stroke={MUTED}
        strokeDasharray="3 4"
      />
      <line
        x1={ball.x}
        y1={ball.y}
        x2={aimEnd.x}
        y2={aimEnd.y}
        stroke={MUTED}
      />
      <line
        data-arrow="start"
        x1={ball.x}
        y1={ball.y - 5}
        x2={start.x}
        y2={start.y}
        stroke={START}
        strokeWidth="2.5"
        markerEnd="url(#arrow-start)"
      />
      <line
        data-arrow="face"
        x1={ball.x}
        y1={ball.y - 5}
        x2={face.x}
        y2={face.y}
        stroke={FACE}
        strokeWidth="2"
        markerEnd="url(#arrow-face)"
      />
      {/* back of the club head, turned with the face, shaft up to the hands */}
      <g
        transform={`translate(60 99) skewX(${-(angles.aim + angles.face) * 0.8})`}
      >
        <rect
          x="-17"
          y="-6"
          width="34"
          height="13"
          rx="6"
          fill="#16181d"
          stroke={FACE}
        />
      </g>
      <line
        x1={60 + golferSide * -14}
        y1="96"
        x2={60 + golferSide * -44}
        y2="44"
        stroke="#c9ced6"
        strokeWidth="2"
      />
      <line
        data-arrow="path"
        x1={pathFrom.x}
        y1={pathFrom.y}
        x2={pathTo.x}
        y2={pathTo.y}
        stroke={PATH}
        strokeWidth="2.5"
        markerEnd="url(#arrow-path)"
      />
      <circle cx={ball.x} cy={ball.y} r="4" fill="#fff" />
    </Card>
  );
};

// Side on, from beyond the toe looking back at the golfer. Shows what swing
// speed does: how fast the head arrives and how the ball leaves.
const ToeView = ({ swingSpeed, launch, targetSide, label, detail }) => {
  const speedLength = 16 + ((swingSpeed - 80) / 60) * 26;
  const launchDrawn = (launch.launchAngleDegrees * 2 * Math.PI) / 180;
  const reach = 40;
  // drawn for a target to the right; a left-hander's is mirrored
  const mirror = targetSide < 0 ? "translate(120 0) scale(-1 1)" : undefined;
  return (
    <Card title="From the toe" detail={detail} label={label}>
      <g transform={mirror}>
        <line x1="4" y1="96" x2="116" y2="96" stroke={MUTED} />
        {/* shaft and head in profile, face tilted back by its loft */}
        <line
          x1="36"
          y1="10"
          x2="46"
          y2="78"
          stroke="#c9ced6"
          strokeWidth="2"
        />
        <path
          d="M30 80 Q28 94 44 94 L56 94 L53 76 Q40 72 30 80 Z"
          fill="#16181d"
          stroke={FACE}
        />
        {/* tee and ball */}
        <line
          x1="62"
          y1="96"
          x2="62"
          y2="90"
          stroke="#f2e6c9"
          strokeWidth="2"
        />
        <circle cx="62" cy="85" r="4.5" fill="#fff" />
        <line
          data-arrow="path"
          x1="8"
          y1="106"
          x2={8 + speedLength}
          y2="106"
          stroke={PATH}
          strokeWidth="2.5"
          markerEnd="url(#arrow-path)"
        />
        <line
          data-arrow="start"
          x1="68"
          y1="82"
          x2={68 + reach * Math.cos(launchDrawn)}
          y2={82 - reach * Math.sin(launchDrawn)}
          stroke={START}
          strokeWidth="2.5"
          markerEnd="url(#arrow-start)"
        />
        {/* backspin */}
        <path
          d="M70 92 A9 9 0 0 0 71 78"
          fill="none"
          stroke={FACE}
          strokeWidth="1.5"
          markerEnd="url(#arrow-face)"
        />
      </g>
    </Card>
  );
};

const direction = (value, positive, negative, zero) => {
  if (value === 0) return zero;
  return `${Math.abs(round(value))}° ${value > 0 ? positive : negative}`;
};

const ClubViews = ({ faceAngle, pathAngle, swingSpeed, aim, side }) => {
  // On the page right is positive. A left-hander's "open" and "in-to-out"
  // point left, and they stand on the other side of the ball.
  const mirror = side === "Left" ? -1 : 1;
  const start =
    FACE_START_WEIGHT * faceAngle + (1 - FACE_START_WEIGHT) * pathAngle;
  const angles = {
    face: mirror * faceAngle * EXAGGERATE,
    path: mirror * pathAngle * EXAGGERATE,
    start: mirror * start * EXAGGERATE,
    aim: aim * EXAGGERATE,
  };
  const launch = driverLaunch(swingSpeed);
  const summary = [
    `face ${direction(faceAngle, "open", "closed", "square")}`,
    `path ${direction(pathAngle, "in-to-out", "out-to-in", "square")}`,
    `ball starts ${direction(mirror * start + aim, "right", "left", "straight")}`,
    `aim ${direction(aim, "right", "left", "straight")}`,
  ].join(", ");

  return (
    <div aria-label="Club at impact">
      <div className="grid grid-cols-3 gap-2">
        <BehindView
          angles={angles}
          golferSide={mirror}
          label={`From behind: ${summary}`}
          detail={`path ${direction(pathAngle, "in-out", "out-in", "square")}`}
        />
        <ToeView
          swingSpeed={swingSpeed}
          launch={launch}
          targetSide={mirror}
          detail={`${round(launch.launchAngleDegrees)}° · ${Math.round(
            launch.backspinRPM,
          )} rpm`}
          label={`From the toe: ${swingSpeed} mph, launches at ${round(
            launch.launchAngleDegrees,
          )}° with ${Math.round(launch.backspinRPM)} rpm of backspin`}
        />
        <TopView
          angles={angles}
          golferSide={mirror}
          label={`From above: ${summary}`}
          detail={`face ${direction(faceAngle, "open", "closed", "square")}`}
        />
      </div>
      <p className="hud-panel mt-2 flex justify-center gap-3 px-2 py-1 text-[10px] uppercase tracking-wider">
        <span style={{ color: FACE }}>Face</span>
        <span style={{ color: PATH }}>Path / speed</span>
        <span style={{ color: START }}>Ball start</span>
      </p>
    </div>
  );
};

export default ClubViews;
