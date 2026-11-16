import React, { useEffect, useRef, useState } from "react";
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
  GAIN,
  REACH,
  fromGround,
  fromSide,
  shownAngles,
  sideHandles,
  snap,
  topHandles,
} from "../../utils/club-handles";
import {
  clubSetup,
  DRIVER_STATIC_LOFT_DEGREES,
} from "../../simulate/club-setup";
import { createClubScene } from "../../simulate/club-scene";
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
  const button = useRef(null);
  // After finishing with the keyboard, put focus back on the value that was
  // typed into. Not after clicking away: the click chose where focus goes.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (draft === null && returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [draft]);
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
            ref={button}
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
              if (event.key === "Enter") {
                returnFocus.current = true;
                commit();
              }
              if (event.key === "Escape") {
                returnFocus.current = true;
                setDraft(null);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

// A round grab handle drawn over a 3D view. It is a real slider to assistive
// tech and the keyboard; the pointer drags it, a double-click resets it.
// While it is hovered or held, a tag beside it says the value.
const Handle = ({
  control,
  value,
  text,
  point,
  bounds,
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
  // The tag sits above the handle, or below when there is no room, and is
  // kept inside the view sideways.
  const tagWidth = text.length * 6.4 + 16;
  const tagX = Math.min(
    Math.max(point.x - tagWidth / 2, 4),
    Math.max(4, bounds.width - tagWidth - 4),
  );
  const tagY = point.y > 40 ? point.y - 38 : point.y + 18;
  return (
    <g
      role="slider"
      tabIndex={0}
      data-control={control}
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
      onFocus={() => onActive(control)}
      onBlur={() => onActive(null)}
      {...drag(control)}
    >
      {/* generous invisible target so the handle is easy to grab */}
      <circle cx={point.x} cy={point.y} r="20" fill="transparent" />
      {lit && (
        <circle cx={point.x} cy={point.y} r="17" fill={colour} opacity="0.28" />
      )}
      {/* dark halo so the ring reads against turf, club and ball alike */}
      <circle
        cx={point.x}
        cy={point.y}
        r={lit ? 12.5 : 11}
        fill="rgba(6,14,10,0.55)"
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={lit ? 10 : 8.5}
        className="club-handle-ring"
        fill="#0b1a12"
        stroke={colour}
        strokeWidth="3"
      />
      <circle cx={point.x} cy={point.y} r="2.6" fill={colour} />
      {lit && (
        <g pointerEvents="none" data-tag>
          <rect
            x={tagX}
            y={tagY}
            width={tagWidth}
            height="20"
            rx="6"
            fill="rgba(6,14,10,0.92)"
            stroke={colour}
            strokeOpacity="0.7"
          />
          <text
            x={tagX + tagWidth / 2}
            y={tagY + 14}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#ffffff"
          >
            {text}
          </text>
        </g>
      )}
    </g>
  );
};

// Fixed camera angles for the two views. x flips for a left-hander.
const VIEW_FROM_ABOVE = {
  orbit: false,
  labels: false,
  airGuides: false,
  camera: { position: [0, 82, -19], lookAt: [0, 2, -1.4], fov: 30 },
};
const VIEW_FROM_TOE = {
  orbit: false,
  labels: false,
  groundGuides: false,
  loftLever: true,
  attackRodLength: 9,
  launchRodLength: 30,
  turfRadius: 420,
  camera: { position: [-70, 10.5, 4], lookAt: [0, 10.5, 4], fov: 30 },
};

// One live 3D view of the driver, with the drag handles laid over it.
const Pad3D = ({
  name,
  caption,
  options,
  setup,
  className,
  note,
  noteOnLeft,
  onScene,
  children,
}) => {
  const box = useRef(null);
  const scene = useRef(null);

  useEffect(() => {
    const created = createClubScene(box.current, options);
    scene.current = created;
    onScene(created);
    // Handle positions depend on the view's size, so say when it changes.
    const observer = new ResizeObserver(() => onScene(created));
    observer.observe(box.current);
    return () => {
      observer.disconnect();
      created.dispose();
      onScene(null);
    };
    // The scene is built once; `options` and `onScene` never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pose only when something the scene draws has changed, not on every
  // hover.
  const pose = JSON.stringify(setup);
  useEffect(() => {
    scene.current.update(setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  return (
    <div
      className={classNames(
        "club-pad relative overflow-hidden rounded-lg ring-1 ring-inset ring-white/10",
        className,
      )}
    >
      <div ref={box} className="absolute inset-0" aria-hidden="true" />
      <p className="pointer-events-none absolute left-2 top-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/75">
        {caption}
      </p>
      {note && (
        <p
          className={classNames(
            "pointer-events-none absolute bottom-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-300",
            noteOnLeft ? "left-2" : "right-2",
          )}
        >
          {note}
        </p>
      )}
      <svg
        className="absolute inset-0 h-full w-full select-none"
        role="group"
        aria-label={name}
      >
        {children}
      </svg>
    </div>
  );
};

// A thumbnail of the flight seen from above, sideways movement drawn larger
// so the shape is readable at this size.
const FlightIcon = ({ sketch }) => (
  <svg
    viewBox="0 0 30 22"
    className="h-[18px] w-6 shrink-0"
    aria-hidden="true"
    data-preview
  >
    <line
      x1="15"
      y1="21"
      x2="15"
      y2="1"
      stroke="rgba(255,255,255,0.25)"
      strokeDasharray="1.5 2.5"
    />
    <polyline
      fill="none"
      stroke={START}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      points={sketch
        .map(
          (p) =>
            `${Math.min(28, Math.max(2, 15 + p.across * 55)).toFixed(1)},${(
              21 -
              p.along * 19
            ).toFixed(1)}`,
        )
        .join(" ")}
    />
  </svg>
);

// The club at impact, shown twice in 3D, as the shot controls: drag a
// handle, use its keys, or click a value to type it.
const ClubPads = ({ values, side, preview, onChange }) => {
  const mirror = side === "Left" ? -1 : 1;
  const [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(null);
  // The two scenes, once built. `layout` only exists to redraw the handles
  // when a view is created, resized or flipped for the other hand.
  const scenes = useRef({ top: null, side: null });
  const [, setLayout] = useState(0);
  const [onTopScene, onSideScene] = useRef([
    (scene) => {
      scenes.current.top = scene;
      setLayout((count) => count + 1);
    },
    (scene) => {
      scenes.current.side = scene;
      setLayout((count) => count + 1);
    },
  ]).current;
  // The scenes flip their cameras for the other hand after this render, so
  // the handles need placing again once they have.
  useEffect(() => {
    setLayout((count) => count + 1);
  }, [side]);

  const {
    clubFaceAngle: face,
    clubPathAngle: path,
    swingSpeed,
    aim,
    attackAngle: attack,
    loftChange,
    strike,
  } = values;
  const launch = driverLaunch(swingSpeed, { attackAngle: attack, loftChange });
  const standardLoft = launch.dynamicLoftDegrees - loftChange;
  const start =
    FACE_START_WEIGHT * face +
    (1 - FACE_START_WEIGHT) * path +
    STRIKE_START_DEGREES_PER_INCH * strike;
  const shown = shownAngles(values, mirror, { standardLoft, start });

  // What each 3D view is posed with. Above: the horizontal story, drawn
  // large. From the toe: attack and loft only, square to the camera.
  const base = clubSetup({
    faceAngle: face,
    pathAngle: path,
    swingSpeed,
    aim,
    attackAngle: attack,
    loftChange,
    strike,
    side,
  });
  const topSetup = {
    ...base,
    aimDegrees: shown.aimDegrees,
    faceDegrees: shown.faceDegrees,
    pathDegrees: shown.pathDegrees,
    startDegrees: shown.startDegrees,
    attackDegrees: 0,
    strikeCm: shown.strikeCm,
  };
  const sideSetup = {
    ...base,
    aimDegrees: 0,
    faceDegrees: 0,
    pathDegrees: 0,
    startDegrees: 0,
    attackDegrees: shown.attackDegrees,
    loftTiltDegrees: shown.loftDegrees - DRIVER_STATIC_LOFT_DEGREES,
    strikeCm: 0,
  };

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

  // Where each handle is drawn, in pixels within its view.
  const onSide = (control) =>
    control === "attackAngle" || control === "loftChange";
  const world = { ...topHandles(shown, mirror), ...sideHandles(shown) };
  const placed = (control) => {
    const scene = onSide(control) ? scenes.current.side : scenes.current.top;
    return scene ? scene.project(world[control]) : null;
  };

  const speedBar = useRef(null);
  const moveTo = (control, event) => {
    let raw;
    if (control === "swingSpeed") {
      const rect = speedBar.current.getBoundingClientRect();
      raw =
        SWING_SPEED_VALUES.MIN +
        ((event.clientX - rect.left) / rect.width) *
          (SWING_SPEED_VALUES.MAX - SWING_SPEED_VALUES.MIN);
    } else if (onSide(control)) {
      const point = scenes.current.side.pick(event.clientX, event.clientY, {
        plane: "side",
      });
      if (!point) return;
      raw = fromSide[control](point, { standardLoft });
    } else {
      // The head is grabbed by its crown, the rest on the turf.
      const point = scenes.current.top.pick(event.clientX, event.clientY, {
        plane: "ground",
        height: control === "strike" ? REACH.headHeight : 0,
      });
      if (!point) return;
      raw = fromGround[control](point, shown, mirror);
    }
    const next = snap(raw, RANGES[control]);
    if (next !== values[control]) onChange(control, next);
  };

  // The aim, face and path handles can sit close together, so a press goes
  // to whichever of them is nearest the pointer, not whichever is on top.
  const nearestHandle = (control, event) => {
    if (!["aim", "clubFaceAngle", "clubPathAngle"].includes(control)) {
      return control;
    }
    const rect = event.currentTarget.closest("svg").getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const distance = (name) => {
      const point = placed(name);
      return Math.hypot(x - point.x, y - point.y);
    };
    return ["aim", "clubFaceAngle", "clubPathAngle"].reduce((best, name) =>
      distance(name) < distance(best) ? name : best,
    );
  };

  const drag = (control) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      const picked = nearestHandle(control, event);
      const pad = event.currentTarget.closest("svg") || document;
      (
        pad.querySelector(`[data-control="${picked}"]`) || event.currentTarget
      ).focus?.();
      setDragging(picked);
      if (picked === "swingSpeed") moveTo(picked, event);
    },
  });

  // While a handle is held, follow the pointer wherever it goes on the page,
  // so the drag survives leaving the handle or the view.
  const follow = useRef(null);
  follow.current = moveTo;
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => follow.current(dragging, event);
    const end = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const handle = (control, bounds) => {
    const point = placed(control);
    if (!point) return null;
    return (
      <Handle
        key={control}
        control={control}
        value={values[control]}
        text={text[control]}
        point={point}
        bounds={bounds}
        colour={describe[control].colour}
        active={active === control}
        dragging={dragging === control}
        drag={drag}
        onChange={onChange}
        onActive={setActive}
      />
    );
  };
  const boundsOf = (scene) => (scene ? scene.size() : { width: 308 });
  const chipProps = (control) => ({
    control,
    value: values[control],
    text: text[control],
    active: active === control || dragging === control,
    onChange,
    onActive: setActive,
  });

  const speedFraction =
    (swingSpeed - SWING_SPEED_VALUES.MIN) /
    (SWING_SPEED_VALUES.MAX - SWING_SPEED_VALUES.MIN);
  // Draw the held handle last so its tag is never under a neighbour.
  const inOrder = (controls) =>
    [...controls].sort(
      (a, b) =>
        (a === dragging || a === active) - (b === dragging || b === active),
    );

  return (
    <div className="flex flex-col gap-1.5" aria-label="Shot controls">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          {preview && <FlightIcon sketch={preview.sketch} />}
          {preview ? preview.shape : "Club at impact"}
        </p>
        <p
          className="text-[11px] text-white/55"
          data-tooltip-id="main-tooltip"
          data-tooltip-content="Angles are drawn several times their real size (the × in each view's corner) so a one-degree change is easy to see and grab. The numbers are the true values."
        >
          Drag a handle · click a value to type
        </p>
      </div>

      <Pad3D
        name="Club from above"
        caption={`Above ×${GAIN.face}`}
        options={VIEW_FROM_ABOVE}
        setup={topSetup}
        className="aspect-[308/206]"
        onScene={onTopScene}
      >
        {inOrder(["strike", "clubPathAngle", "clubFaceAngle", "aim"]).map(
          (control) => handle(control, boundsOf(scenes.current.top)),
        )}
      </Pad3D>

      <div className="grid grid-cols-2 gap-1.5">
        <ValueChip {...chipProps("clubFaceAngle")} />
        <ValueChip {...chipProps("clubPathAngle")} />
        <ValueChip {...chipProps("strike")} />
        <ValueChip {...chipProps("aim")} />
      </div>

      <Pad3D
        name="Club from the side"
        caption={`Toe ×${GAIN.attack}`}
        options={VIEW_FROM_TOE}
        setup={sideSetup}
        className="aspect-[308/112]"
        note={`launch ${launch.launchAngleDegrees.toFixed(1)}° · ${Math.round(
          launch.backspinRPM,
        )} rpm`}
        // keep it clear of the attack handle, which swaps sides with the golfer
        noteOnLeft={mirror < 0}
        onScene={onSideScene}
      >
        {inOrder(["attackAngle", "loftChange"]).map((control) =>
          handle(control, boundsOf(scenes.current.side)),
        )}
      </Pad3D>
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
          ref={speedBar}
          role="slider"
          tabIndex={0}
          data-control="swingSpeed"
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
          {...drag("swingSpeed")}
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
