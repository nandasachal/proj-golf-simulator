import React, { useRef, useState } from "react";
import { classNames } from "../../utils/functions";
import {
  AIM_VALUES,
  ATTACK_ANGLE_VALUES,
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
  LOFT_CHANGE_VALUES,
  STRIKE_VALUES,
  SWING_SPEED_VALUES,
} from "../../utils/constant";
import { SHORTCUTS, keyLabel } from "../../utils/shortcuts";
import {
  SIDE,
  TOP,
  aimFromPointer,
  aimHandle,
  aimTurn,
  attackFromPointer,
  attackHandle,
  faceFromPointer,
  faceHandle,
  faceTurn,
  headShift,
  loftFromPointer,
  loftHandle,
  pathFromPointer,
  pathHandle,
  pathTurn,
  sideX,
  snap,
  strikeFromPointer,
  toPadPoint,
} from "../../utils/club-pad";
import {
  driverLaunch,
  FACE_START_WEIGHT,
  STRIKE_START_DEGREES_PER_INCH,
} from "../../simulate/launch-conditions";

const FACE = "#ffffff";
const PATH = "#a3e635";
const START = "#fb923c";
const STRIKE = "#fbbf24";
const AIM = "#7dd3fc";
const MUTED = "rgba(255,255,255,0.32)";
const DEGREES = Math.PI / 180;

const RANGES = {
  clubFaceAngle: CLUB_FACE_ANGLE_VALUES,
  clubPathAngle: CLUB_PATH_ANGLE_VALUES,
  swingSpeed: SWING_SPEED_VALUES,
  aim: AIM_VALUES,
  attackAngle: ATTACK_ANGLE_VALUES,
  loftChange: LOFT_CHANGE_VALUES,
  strike: STRIKE_VALUES,
};

const words = (value, positive, negative, zero, unit = "°") =>
  value === 0
    ? zero
    : `${Math.abs(value)}${unit} ${value > 0 ? positive : negative}`;

// What each control is called, how its value reads, and what a typed number
// means.
const describe = {
  clubFaceAngle: {
    name: "Club face",
    text: (v) => words(v, "open", "closed", "square"),
    typing: "degrees: + open, − closed",
    colour: FACE,
  },
  clubPathAngle: {
    name: "Club path",
    text: (v) => words(v, "in-to-out", "out-to-in", "square"),
    typing: "degrees: + in-to-out, − out-to-in",
    colour: PATH,
  },
  strike: {
    name: "Strike",
    text: (v) => words(v, "toe", "heel", "centre", " in"),
    typing: "inches: + toe, − heel",
    colour: STRIKE,
  },
  aim: {
    name: "Aim",
    text: (v) => words(v, "right", "left", "straight"),
    typing: "degrees: + right, − left",
    colour: AIM,
  },
  attackAngle: {
    name: "Attack angle",
    text: (v) => words(v, "up", "down", "level"),
    typing: "degrees: + up, − down",
    colour: PATH,
  },
  loftChange: {
    name: "Loft",
    typing: "degrees added to the standard loft",
    colour: FACE,
  },
  swingSpeed: {
    name: "Swing speed",
    text: (v) => `${v} mph`,
    typing: "mph",
    colour: PATH,
  },
};

// A value you can click to type over. Enter or clicking away keeps it,
// Escape puts it back.
const ValueChip = ({ control, value, text, active, onChange, onActive }) => {
  const [draft, setDraft] = useState(null);
  const range = RANGES[control];
  const { name, typing, colour } = describe[control];
  const keys = SHORTCUTS[control];

  const commit = () => {
    const typed = Number.parseFloat(draft);
    if (Number.isFinite(typed)) onChange(control, snap(typed, range));
    setDraft(null);
  };

  return (
    <div
      className={classNames(
        "flex h-11 items-center gap-2 rounded-lg px-2.5 transition-colors md:h-10",
        active ? "bg-white/20" : "bg-white/[0.07]",
      )}
      onPointerEnter={() => onActive(control)}
      onPointerLeave={() => onActive(null)}
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colour }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1 text-[11px] leading-tight text-white/60">
          <span className="truncate">{name}</span>
          <span className="shrink-0 font-mono text-[10px] text-white/45">
            {keyLabel(keys.down)} {keyLabel(keys.up)}
          </span>
        </div>
        {draft === null ? (
          <button
            type="button"
            className="-mx-1 block w-[calc(100%+0.5rem)] truncate rounded px-1 text-left text-sm font-semibold tabular-nums leading-tight hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400"
            aria-label={`Edit ${name.toLowerCase()}: ${text}`}
            data-tooltip-id="main-tooltip"
            data-tooltip-content={`Click to type a value · keys ${keyLabel(keys.down)} / ${keyLabel(keys.up)}`}
            onClick={() => setDraft(String(value))}
          >
            {text}
          </button>
        ) : (
          <input
            type="number"
            aria-label={name}
            title={`${name} in ${typing} (${range.MIN} to ${range.MAX})`}
            className="-mx-1 block w-[calc(100%+0.5rem)] rounded bg-white px-1 text-sm font-semibold tabular-nums leading-tight text-slate-900 outline-none"
            min={range.MIN}
            max={range.MAX}
            step={range.STEP}
            value={draft}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setDraft(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

// A round grab handle inside a pad. It is a real slider to assistive tech
// and the keyboard; the pointer drags it, a double-click resets it.
const Handle = ({
  control,
  value,
  text,
  point,
  colour,
  active,
  dragging,
  drag,
  onChange,
  onActive,
}) => {
  const range = RANGES[control];
  const nudge = (event) => {
    const step = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    }[event.key];
    if (step) {
      event.preventDefault();
      onChange(control, snap(value + step * range.STEP, range));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(control, event.key === "Home" ? range.MIN : range.MAX);
    }
  };
  const lit = active || dragging;
  return (
    <g
      role="slider"
      tabIndex={0}
      aria-label={describe[control].name}
      aria-valuemin={range.MIN}
      aria-valuemax={range.MAX}
      aria-valuenow={value}
      aria-valuetext={text}
      className="club-handle"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onKeyDown={nudge}
      onDoubleClick={() => onChange(control, range.DEFAULT)}
      onPointerEnter={() => onActive(control)}
      onPointerLeave={() => onActive(null)}
      {...drag(control)}
    >
      {/* generous invisible target so the handle is easy to grab */}
      <circle cx={point.x} cy={point.y} r="22" fill="transparent" />
      {lit && (
        <circle cx={point.x} cy={point.y} r="17" fill={colour} opacity="0.25" />
      )}
      <circle
        cx={point.x}
        cy={point.y}
        r={lit ? 11 : 9.5}
        className="club-handle-ring"
        fill="#0b1a12"
        stroke={colour}
        strokeWidth="3"
      />
      <circle cx={point.x} cy={point.y} r="3" fill={colour} />
    </g>
  );
};

const Arrowheads = () => (
  <defs>
    {[
      ["face", FACE],
      ["path", PATH],
      ["start", START],
    ].map(([name, colour]) => (
      <marker
        key={name}
        id={`pad-arrow-${name}`}
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="4.5"
        markerHeight="4.5"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill={colour} />
      </marker>
    ))}
  </defs>
);

// The club at impact, drawn twice, as the shot controls: drag a handle, use
// its keys, or click a value to type it.
const ClubPads = ({ values, side, preview, onChange }) => {
  const mirror = side === "Left" ? -1 : 1;
  const [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(null);
  const topPad = useRef(null);
  const sidePad = useRef(null);

  const {
    clubFaceAngle: face,
    clubPathAngle: path,
    swingSpeed,
    aim,
    attackAngle: attack,
    loftChange,
    strike,
  } = values;
  const setup = { face, path, aim, strike, mirror };
  const launch = driverLaunch(swingSpeed, { attackAngle: attack, loftChange });
  const standardLoft = launch.dynamicLoftDegrees - loftChange;
  const start =
    FACE_START_WEIGHT * face +
    (1 - FACE_START_WEIGHT) * path +
    STRIKE_START_DEGREES_PER_INCH * strike;
  const startTurn = aimTurn(aim) + mirror * start * TOP.anglePerDegree;

  const text = {
    clubFaceAngle: describe.clubFaceAngle.text(face),
    clubPathAngle: describe.clubPathAngle.text(path),
    strike: describe.strike.text(strike),
    aim: describe.aim.text(aim),
    attackAngle: describe.attackAngle.text(attack),
    loftChange: `${launch.dynamicLoftDegrees.toFixed(1)}°${
      loftChange === 0 ? "" : ` (${loftChange > 0 ? "+" : ""}${loftChange})`
    }`,
    swingSpeed: describe.swingSpeed.text(swingSpeed),
  };

  // What a pointer position means for each control, before snapping.
  const fromPointer = {
    clubFaceAngle: (p) => faceFromPointer(p, setup),
    clubPathAngle: (p) => pathFromPointer(p, setup),
    aim: (p) => aimFromPointer(p),
    strike: (p) => strikeFromPointer(p, setup),
    attackAngle: (p) => attackFromPointer(p, { mirror }),
    loftChange: (p) => loftFromPointer(p, { mirror }) - standardLoft,
  };
  const padOf = (control) =>
    control === "attackAngle" || control === "loftChange"
      ? [sidePad, SIDE]
      : [topPad, TOP];

  const moveTo = (control, event) => {
    const [ref, pad] = padOf(control);
    const point = toPadPoint(event, ref.current.getBoundingClientRect(), pad);
    const next = snap(fromPointer[control](point), RANGES[control]);
    if (next !== values[control]) onChange(control, next);
  };
  const drag = (control) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus?.();
      setDragging(control);
    },
    onPointerMove: (event) => {
      if (dragging === control) moveTo(control, event);
    },
    onPointerUp: () => setDragging(null),
    onPointerCancel: () => setDragging(null),
  });

  const handleProps = (control) => ({
    control,
    value: values[control],
    text: text[control],
    colour: describe[control].colour,
    active: active === control,
    dragging: dragging === control,
    drag,
    onChange,
    onActive: setActive,
  });
  const chipProps = (control) => ({
    control,
    value: values[control],
    text: text[control],
    active: active === control || dragging === control,
    onChange,
    onActive: setActive,
  });

  const { ball } = TOP;
  const shift = headShift(setup);
  const loftPoint = loftHandle({ loft: launch.dynamicLoftDegrees, mirror });
  const attackPoint = attackHandle({ attack, mirror });
  const launchDrawn = launch.launchAngleDegrees * 2 * DEGREES;
  const speedFraction =
    (swingSpeed - SWING_SPEED_VALUES.MIN) /
    (SWING_SPEED_VALUES.MAX - SWING_SPEED_VALUES.MIN);

  const setSpeedFrom = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    onChange(
      "swingSpeed",
      snap(
        SWING_SPEED_VALUES.MIN +
          fraction * (SWING_SPEED_VALUES.MAX - SWING_SPEED_VALUES.MIN),
        SWING_SPEED_VALUES,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-1.5" aria-label="Shot controls">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">
          {preview ? preview.shape : "Club at impact"}
        </p>
        <p className="text-[11px] text-white/55">
          Drag a handle · click a value to type
        </p>
      </div>

      {/* From above: aim, face, path, strike */}
      <svg
        ref={topPad}
        viewBox={`0 0 ${TOP.width} ${TOP.height}`}
        className="club-pad block w-full select-none rounded-lg"
        role="group"
        aria-label="Club from above"
      >
        <Arrowheads />
        <line
          x1={ball.x}
          y1="6"
          x2={ball.x}
          y2={TOP.height - 6}
          stroke={MUTED}
          strokeDasharray="3 5"
        />
        {/* where this setup sends the ball, sketched from above */}
        {preview && (
          <polyline
            data-preview
            fill="none"
            stroke={START}
            strokeWidth="2"
            strokeDasharray="1 5"
            strokeLinecap="round"
            opacity="0.9"
            points={preview.sketch
              .map(
                (p) =>
                  `${(ball.x + p.across * 130).toFixed(1)},${(
                    ball.y -
                    8 -
                    p.along * 92
                  ).toFixed(1)}`,
              )
              .join(" ")}
          />
        )}
        {/* the arc the aim handle rides on */}
        <path
          d={`M ${aimHandle(AIM_VALUES.MIN).x} ${aimHandle(AIM_VALUES.MIN).y} A ${TOP.aimRadius} ${TOP.aimRadius} 0 0 1 ${aimHandle(AIM_VALUES.MAX).x} ${aimHandle(AIM_VALUES.MAX).y}`}
          fill="none"
          stroke={MUTED}
          strokeWidth="2"
        />
        <g transform={`rotate(${aimTurn(aim)} ${ball.x} ${ball.y})`}>
          <line
            x1={ball.x}
            y1={ball.y - 12}
            x2={ball.x}
            y2={ball.y - TOP.aimRadius + 12}
            stroke={AIM}
            strokeWidth="1.5"
            opacity="0.7"
          />
        </g>
        {/* path: the head arriving from behind the ball */}
        <g
          data-arrow="path"
          transform={`rotate(${pathTurn(setup)} ${ball.x} ${ball.y})`}
        >
          <line
            x1={ball.x}
            y1={ball.y + TOP.pathRadius - 12}
            x2={ball.x}
            y2={ball.y + 52}
            stroke={PATH}
            strokeWidth="4"
            markerEnd="url(#pad-arrow-path)"
          />
        </g>
        {/* face: the head, and where the face points */}
        <g
          data-arrow="face"
          transform={`rotate(${faceTurn(setup)} ${ball.x} ${ball.y})`}
        >
          <line
            x1={ball.x}
            y1={ball.y - 14}
            x2={ball.x}
            y2={ball.y - TOP.faceRadius + 13}
            stroke={FACE}
            strokeWidth="3"
            markerEnd="url(#pad-arrow-face)"
          />
          <g
            data-strike
            transform={`translate(${shift} 0)`}
            style={{
              cursor: dragging === "strike" ? "grabbing" : "ew-resize",
              touchAction: "none",
            }}
            role="slider"
            tabIndex={0}
            aria-label={describe.strike.name}
            aria-valuemin={STRIKE_VALUES.MIN}
            aria-valuemax={STRIKE_VALUES.MAX}
            aria-valuenow={strike}
            aria-valuetext={text.strike}
            className="club-handle"
            onKeyDown={(event) => {
              const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
              if (step) {
                event.preventDefault();
                onChange(
                  "strike",
                  snap(strike + step * STRIKE_VALUES.STEP, STRIKE_VALUES),
                );
              }
            }}
            onDoubleClick={() => onChange("strike", STRIKE_VALUES.DEFAULT)}
            onPointerEnter={() => setActive("strike")}
            onPointerLeave={() => setActive(null)}
            {...drag("strike")}
          >
            <rect
              x={ball.x - 50}
              y={ball.y + 10}
              width="100"
              height="32"
              rx="14"
              className="club-handle-ring"
              fill="#15181d"
              stroke={
                active === "strike" || dragging === "strike" ? STRIKE : FACE
              }
              strokeWidth="2.5"
            />
            <line
              x1={ball.x - mirror * 50}
              y1={ball.y + 26}
              x2={ball.x - mirror * 84}
              y2={ball.y + 38}
              stroke="#c9ced6"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* grip marks: this is the part you slide */}
            <path
              d={`M ${ball.x - 26} ${ball.y + 20} l -7 6 l 7 6 M ${ball.x + 26} ${ball.y + 20} l 7 6 l -7 6`}
              fill="none"
              stroke={STRIKE}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <circle cx={ball.x} cy={ball.y} r="10" fill="#ffffff" />
        <g
          data-arrow="start"
          transform={`rotate(${startTurn} ${ball.x} ${ball.y})`}
        >
          <line
            x1={ball.x}
            y1={ball.y - 14}
            x2={ball.x}
            y2={ball.y - 38}
            stroke={START}
            strokeWidth="3"
            markerEnd="url(#pad-arrow-start)"
          />
        </g>
        <Handle {...handleProps("clubPathAngle")} point={pathHandle(setup)} />
        <Handle {...handleProps("clubFaceAngle")} point={faceHandle(setup)} />
        <Handle {...handleProps("aim")} point={aimHandle(aim)} />
      </svg>

      <div className="grid grid-cols-2 gap-1.5">
        <ValueChip {...chipProps("clubFaceAngle")} />
        <ValueChip {...chipProps("clubPathAngle")} />
        <ValueChip {...chipProps("strike")} />
        <ValueChip {...chipProps("aim")} />
      </div>

      {/* From the side: attack angle and loft */}
      <svg
        ref={sidePad}
        viewBox={`0 0 ${SIDE.width} ${SIDE.height}`}
        className="club-pad block w-full select-none rounded-lg"
        role="group"
        aria-label="Club from the side"
      >
        <Arrowheads />
        <line
          x1="8"
          y1={SIDE.ground}
          x2={SIDE.width - 8}
          y2={SIDE.ground}
          stroke={MUTED}
        />
        <g
          transform={
            mirror < 0 ? `translate(${SIDE.width} 0) scale(-1 1)` : undefined
          }
        >
          <line
            x1="128"
            y1="6"
            x2="144"
            y2="68"
            stroke="#c9ced6"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M118 70 Q114 85 136 85 L160 85 L160 64 Q136 58 118 70 Z"
            fill="#15181d"
            stroke={FACE}
            strokeWidth="2"
          />
          <line
            x1="178"
            y1={SIDE.ground}
            x2="178"
            y2="80"
            stroke="#f2e6c9"
            strokeWidth="3"
          />
          <circle cx="178" cy="73" r="8" fill="#ffffff" />
          <line
            data-arrow="start"
            x1="190"
            y1="68"
            x2={190 + 54 * Math.cos(launchDrawn)}
            y2={68 - 54 * Math.sin(launchDrawn)}
            stroke={START}
            strokeWidth="3"
            markerEnd="url(#pad-arrow-start)"
          />
        </g>
        <line
          data-arrow="face"
          x1={sideX(SIDE.facePivot.x, mirror)}
          y1={SIDE.facePivot.y}
          x2={loftPoint.x}
          y2={loftPoint.y}
          stroke={FACE}
          strokeWidth="3"
        />
        <line
          data-arrow="path"
          x1={attackPoint.x}
          y1={attackPoint.y}
          x2={sideX(SIDE.attackTip.x, mirror)}
          y2={SIDE.attackTip.y}
          stroke={PATH}
          strokeWidth="4"
          markerEnd="url(#pad-arrow-path)"
        />
        <text
          x={sideX(SIDE.width - 10, mirror)}
          y="14"
          textAnchor={mirror < 0 ? "start" : "end"}
          fontSize="11"
          fill={START}
        >
          launch {launch.launchAngleDegrees.toFixed(1)}° ·{" "}
          {Math.round(launch.backspinRPM)} rpm
        </text>
        <Handle {...handleProps("attackAngle")} point={attackPoint} />
        <Handle {...handleProps("loftChange")} point={loftPoint} />
      </svg>

      <div className="grid grid-cols-2 gap-1.5">
        <ValueChip {...chipProps("attackAngle")} />
        <ValueChip {...chipProps("loftChange")} />
      </div>

      {/* Speed: one wide bar. Click or drag anywhere on it. */}
      <div className="flex items-center gap-1.5">
        <div className="w-[calc(50%-0.1875rem)] shrink-0">
          <ValueChip {...chipProps("swingSpeed")} />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={describe.swingSpeed.name}
          aria-valuemin={SWING_SPEED_VALUES.MIN}
          aria-valuemax={SWING_SPEED_VALUES.MAX}
          aria-valuenow={swingSpeed}
          aria-valuetext={text.swingSpeed}
          className="club-handle relative h-11 flex-1 cursor-pointer overflow-hidden rounded-lg bg-white/[0.07] md:h-10"
          style={{ touchAction: "none" }}
          onKeyDown={(event) => {
            const step = {
              ArrowRight: 1,
              ArrowUp: 1,
              ArrowLeft: -1,
              ArrowDown: -1,
            }[event.key];
            if (step) {
              event.preventDefault();
              onChange(
                "swingSpeed",
                snap(swingSpeed + step, SWING_SPEED_VALUES),
              );
            }
          }}
          onDoubleClick={() =>
            onChange("swingSpeed", SWING_SPEED_VALUES.DEFAULT)
          }
          onPointerEnter={() => setActive("swingSpeed")}
          onPointerLeave={() => setActive(null)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging("swingSpeed");
            setSpeedFrom(event);
          }}
          onPointerMove={(event) => {
            if (dragging === "swingSpeed") setSpeedFrom(event);
          }}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
        >
          <div
            className="absolute inset-y-0 left-0 bg-lime-400/80"
            style={{ width: `${speedFraction * 100}%` }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold text-white/70">
            <span>{SWING_SPEED_VALUES.MIN}</span>
            <span>{SWING_SPEED_VALUES.MAX}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClubPads;
