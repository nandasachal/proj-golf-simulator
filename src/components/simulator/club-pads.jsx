import React, { useEffect, useMemo, useRef, useState } from "react";
import { Listbox } from "@headlessui/react";
import {
  ArrowCounterclockwise,
  ChevronDown,
  InfoCircle,
} from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import { track } from "../../analytics";
import { CATEGORIES, CLUBS } from "../../simulate/clubs";
import { ALL_CONTROLS, neutralOf, stateOf } from "../../utils/shortcuts";
import {
  GAIN,
  fromGround,
  fromSide,
  shownAngles,
  sideHandles,
  snap,
  topHandles,
} from "../../utils/club-handles";
import { clubSetup } from "../../simulate/club-setup";
import { createClubScene } from "../../simulate/club-scene";
import { clubLaunch } from "../../simulate/launch-conditions";

const FACE = "#ffffff";
const PATH = "#a3e635";
const START = "#fb923c";
const STRIKE = "#fbbf24";
const AIM = "#7dd3fc";
const ATTACK = "#c4b5fd";
const LOFT = "#f9a8d4";
const SPEED = "#2dd4bf";

const words = (value, positive, negative, zero, unit = "°") =>
  value === 0
    ? zero
    : `${Math.abs(value)}${unit} ${value > 0 ? positive : negative}`;

// What each control is called, how its value reads, what a typed number
// means, and (`info`) what it does to the shot, said when its (i) is clicked. A value reads as a word and a number, shown as two fields: `words`
// are the word below, at and above neutral, and `number` is the size.
const degrees = (v) => `${Math.abs(v)}°`;
const describe = {
  clubFaceAngle: {
    name: "Club face",
    text: (v) => words(v, "open", "closed", "square"),
    words: ["closed", "square", "open"],
    number: degrees,
    typing: "degrees: + open, − closed",
    colour: FACE,
    info: "Where the club face points at impact, measured from your aim. It mostly decides where the ball starts: open starts it right, closed left (for a right-hander).",
  },
  clubPathAngle: {
    name: "Club path",
    text: (v) => words(v, "in-to-out", "out-to-in", "square"),
    words: ["out-to-in", "square", "in-to-out"],
    number: degrees,
    typing: "degrees: + in-to-out, − out-to-in",
    colour: PATH,
    info: "The direction the club head is travelling through impact. Against the face it decides the curve: a face open to the path fades or slices, a face closed to it draws or hooks.",
  },
  strike: {
    name: "Strike",
    text: (v) => words(v, "toe", "heel", "centre", " in"),
    words: ["heel", "centre", "toe"],
    number: (v) => `${Math.abs(v)} in`,
    typing: "inches: + toe, − heel",
    colour: STRIKE,
    info: "Where on the face the ball is struck. Off the toe it tends to draw and off the heel to fade, and either way it loses distance.",
  },
  aim: {
    name: "Aim",
    text: (v) => words(v, "right", "left", "straight"),
    words: ["left", "straight", "right"],
    number: degrees,
    typing: "degrees: + right, − left",
    colour: AIM,
    info: "Where you line up, left or right of the centre line. Face and path are measured from it, so it moves the whole shot.",
  },
  attackAngle: {
    name: "Attack angle",
    text: (v) => words(v, "up", "down", "level"),
    words: ["down", "level", "up"],
    number: degrees,
    typing: "degrees: + up, − down",
    colour: ATTACK,
    info: "Whether the club head is moving up or down at impact. Hitting up launches higher with less spin; hitting down launches lower with more.",
  },
  loftChange: {
    name: "Loft",
    words: ["less", "stock", "more"],
    typing: "degrees added to the standard loft",
    colour: LOFT,
    info: "The loft the club presents at impact. More loft launches higher with more spin; less launches lower and runs farther.",
  },
  swingSpeed: {
    name: "Swing speed",
    text: (v) => `${Math.round(v * 10) / 10} mph`,
    words: ["slower", "stock", "faster"],
    number: (v) => `${Math.round(v * 10) / 10} mph`,
    typing: "mph",
    colour: SPEED,
    info: "How fast the club head is moving at impact. More speed is more distance, and more curve on a shot that is already bending.",
  },
};

// One value box: the control's name, with an (i) that says what it does, over
// two fields. The word (square, open, closed) is a menu of the three it can
// be; the number can be clicked to type over (Enter or clicking away keeps
// it, Escape puts it back). The box the keyboard is on is outlined.
const ValueChip = ({
  control,
  range,
  value,
  text,
  number,
  active,
  selected,
  onChange,
  onActive,
  onSelect,
  about,
  onAbout,
}) => {
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
  const { name, typing, colour } = describe[control];
  const neutral = neutralOf(control, range);
  const state = stateOf(control, value, range);
  const word = describe[control].words[state + 1];
  // Choosing a word: neutral, or the same size on the other side of it (one
  // step out from neutral).
  const choose = (next) => {
    if (next === state) return;
    const size = Math.abs(value - neutral) || range.STEP;
    onChange(control, snap(neutral + next * size, range));
  };

  const commit = () => {
    const typed = Number.parseFloat(draft);
    if (Number.isFinite(typed)) onChange(control, snap(typed, range));
    setDraft(null);
  };

  return (
    <div
      className={classNames(
        "flex h-12 items-center gap-2 rounded-lg px-2.5 ring-inset transition-colors md:h-11",
        active ? "bg-white/20" : "bg-white/[0.07]",
        selected && "ring-2 ring-lime-400",
      )}
      data-chip={control}
      data-selected={selected ? "true" : undefined}
      onPointerEnter={() => onActive(control)}
      onPointerLeave={() => onActive(null)}
      onPointerDown={() => onSelect(control)}
      onFocus={() => onSelect(control)}
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colour }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[11px] leading-tight text-white/60">
          <span className="truncate">{name}</span>
          <button
            type="button"
            aria-label={`About ${name.toLowerCase()}`}
            aria-expanded={about}
            aria-controls="control-info"
            className="-my-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400"
            onClick={() => onAbout(about ? null : control)}
          >
            <InfoCircle size={11} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="relative -ml-1 flex min-w-0 items-center">
            <select
              aria-label={`${name}: ${word}`}
              data-field="word"
              className={classNames(
                "min-w-0 cursor-pointer appearance-none truncate rounded bg-transparent py-0 pl-1 pr-3.5 text-sm font-semibold leading-tight hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400",
                state === 0 ? "text-white/70" : "text-white",
              )}
              value={state}
              onChange={(event) => choose(Number(event.target.value))}
            >
              {describe[control].words.map((option, i) => (
                <option key={option} value={i - 1} className="text-slate-900">
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              size={9}
              className="pointer-events-none absolute right-0.5 text-white/50"
              aria-hidden="true"
            />
          </span>
          {draft === null ? (
            <button
              ref={button}
              type="button"
              className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-px text-center text-sm font-semibold tabular-nums leading-tight hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400"
              aria-label={`Edit ${name.toLowerCase()}: ${text}`}
              data-field="number"
              onClick={() => setDraft(String(value))}
            >
              {/* The unit is set small, so the word beside it has room. */}
              {number.endsWith(" mph") ? (
                <>
                  {number.slice(0, -4)}
                  <span className="text-[10px] font-medium text-white/60">
                    {" "}
                    mph
                  </span>
                </>
              ) : (
                number
              )}
            </button>
          ) : (
            <input
              type="number"
              aria-label={name}
              title={`${name} in ${typing} (${range.MIN} to ${range.MAX})`}
              className="ml-auto block w-16 rounded bg-white px-1 text-right text-sm font-semibold tabular-nums leading-tight text-slate-900 outline-none"
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
    </div>
  );
};

// A round grab handle drawn over a 3D view. It is a real slider to assistive
// tech and the keyboard; the pointer drags it, a double-click resets it.
// While it is hovered or held, a tag beside it says the value.
const Handle = ({
  control,
  range,
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
  onSelect,
}) => {
  // Arrow keys belong to the panel (move between boxes; with Command, change
  // the selected one), so a handle only answers Home and End itself.
  const nudge = (event) => {
    if (event.key === "Home" || event.key === "End") {
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
      onFocus={() => {
        onActive(control);
        onSelect(control);
      }}
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
  launchRodLength: 22,
  turfRadius: 420,
  // Framed tight on what the handles reach: from the attack handle behind
  // the ball to the end of the launch arrow, turf to the top of the loft line.
  camera: { position: [-70, 10, -1], lookAt: [0, 10, -1], fov: 25 },
};

// One live 3D view of the club, with the drag handles laid over it. It is
// keyed by club, so choosing another club builds a new scene.
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
// The club in hand, as a chip that opens the bag. Distances are set in
// Settings.
const ClubMenu = ({ club, onClub }) => (
  <Listbox value={club.id} onChange={onClub}>
    <div className="relative min-w-0">
      <Listbox.Button className="flex h-12 w-full items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 text-left transition-colors hover:bg-white/20 md:h-11">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-normal leading-tight text-white/60">
            Club
          </span>
          <span
            className="block truncate text-sm font-semibold leading-tight"
            data-club
          >
            {club.name} · {club.loftDegrees}°
          </span>
        </span>
        <ChevronDown
          size={11}
          className="shrink-0 text-white/60"
          aria-hidden="true"
        />
      </Listbox.Button>
      <Listbox.Options className="hud-panel hud-panel-solid absolute right-0 top-full z-40 mt-1 max-h-[min(60dvh,420px)] w-48 overflow-y-auto p-1 text-xs font-medium focus:outline-none">
        {Object.entries(CATEGORIES).map(([category, label]) => (
          <React.Fragment key={category}>
            {category !== "driver" && (
              <li
                role="presentation"
                className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/45"
              >
                {label}
              </li>
            )}
            {CLUBS.filter((entry) => entry.category === category).map(
              (entry) => (
                <Listbox.Option
                  key={entry.id}
                  value={entry.id}
                  className={({ active, selected }) =>
                    classNames(
                      "flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5",
                      active && "bg-white/15",
                      selected ? "font-bold text-lime-300" : "text-white/85",
                    )
                  }
                >
                  <span>{entry.name}</span>
                  <span className="tabular-nums text-white/55">
                    {entry.loftDegrees}°
                  </span>
                </Listbox.Option>
              ),
            )}
          </React.Fragment>
        ))}
      </Listbox.Options>
    </div>
  </Listbox>
);

const ClubPads = ({
  values,
  side,
  club,
  ranges,
  selected,
  onSelect,
  preview,
  onChange,
  onClub,
  onReset,
  views = true,
  controls = ALL_CONTROLS,
}) => {
  const shows = (control) => controls.includes(control);
  const mirror = side === "Left" ? -1 : 1;
  const [active, setActive] = useState(null);
  // The control whose (i) is open. A click anywhere else, or Escape, puts
  // its explanation away.
  const [about, setAbout] = useState(null);
  const chips = useRef(null);
  useEffect(() => {
    if (!about) return undefined;
    const away = (event) => {
      if (!chips.current?.contains(event.target)) setAbout(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") setAbout(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [about]);
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
  const launch = clubLaunch(club, swingSpeed, {
    attackAngle: attack,
    loftChange,
  });
  const standardLoft = launch.dynamicLoftDegrees - loftChange;
  const start =
    club.faceStartWeight * face +
    (1 - club.faceStartWeight) * path +
    club.strike.start * strike;
  const shown = shownAngles(values, mirror, { standardLoft, start, club });

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
    club: club.id,
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
    loftTiltDegrees: shown.loftDegrees - club.loftDegrees,
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

  // The number field of each box.
  const number = {
    clubFaceAngle: describe.clubFaceAngle.number(face),
    clubPathAngle: describe.clubPathAngle.number(path),
    strike: describe.strike.number(strike),
    aim: describe.aim.number(aim),
    attackAngle: describe.attackAngle.number(attack),
    loftChange: `${launch.dynamicLoftDegrees.toFixed(1)}°`,
    swingSpeed: describe.swingSpeed.number(swingSpeed),
  };

  // Where each handle is drawn, in pixels within its view.
  const onSide = (control) =>
    control === "attackAngle" || control === "loftChange";
  const world = { ...topHandles(shown, mirror), ...sideHandles(shown) };
  const placed = (control) => {
    const scene = onSide(control) ? scenes.current.side : scenes.current.top;
    return scene ? scene.project(world[control]) : null;
  };

  const moveTo = (control, event) => {
    let raw;
    if (onSide(control)) {
      const point = scenes.current.side.pick(event.clientX, event.clientY, {
        plane: "side",
      });
      if (!point) return;
      raw = fromSide[control](point, { ...shown, standardLoft });
    } else {
      // The head is grabbed by its crown, the rest on the turf.
      const point = scenes.current.top.pick(event.clientX, event.clientY, {
        plane: "ground",
        height: control === "strike" ? shown.grab.height : 0,
      });
      if (!point) return;
      raw = fromGround[control](point, shown, mirror);
    }
    const next = snap(raw, ranges[control]);
    if (next !== values[control]) onChange(control, next);
  };

  // The aim, face and path handles can sit close together, so a press goes
  // to whichever of them is nearest the pointer, not whichever is on top.
  const nearestHandle = (control, event) => {
    const crowded = ["aim", "clubFaceAngle", "clubPathAngle"].filter(shows);
    if (!crowded.includes(control)) return control;
    const rect = event.currentTarget.closest("svg").getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const distance = (name) => {
      const point = placed(name);
      return Math.hypot(x - point.x, y - point.y);
    };
    return crowded.reduce((best, name) =>
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
      onSelect(picked);
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
        range={ranges[control]}
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
        onSelect={onSelect}
      />
    );
  };
  const boundsOf = (scene) => (scene ? scene.size() : { width: 308 });
  const chipProps = (control) => ({
    control,
    range: ranges[control],
    value: values[control],
    text: text[control],
    number: number[control],
    active: active === control || dragging === control,
    selected: selected === control,
    onChange,
    onActive: setActive,
    onSelect,
    about: about === control,
    onAbout: (opened) => {
      if (opened) track("info_opened", { topic: opened });
      setAbout(opened);
    },
  });

  // Each view is built for one club.
  const topOptions = useMemo(() => ({ ...VIEW_FROM_ABOVE, club }), [club]);
  const sideOptions = useMemo(() => ({ ...VIEW_FROM_TOE, club }), [club]);
  // Draw the held handle last so its tag is never under a neighbour.
  const inOrder = (controls) =>
    [...controls].sort(
      (a, b) =>
        (a === dragging || a === active) - (b === dragging || b === active),
    );

  return (
    <div className="flex flex-col gap-2" aria-label="Shot controls">
      {/* What this setup will do, with Reset; a rule sets it apart from the
          controls under it. */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 px-1"
          data-shot-shape
        >
          {preview && <FlightIcon sketch={preview.sketch} />}
          <p className="min-w-0 truncate text-sm leading-tight">
            <span className="text-white/60">Shot shape: </span>
            <span className="font-semibold">
              {preview ? preview.shape : "Club at impact"}
            </span>
          </p>
        </div>
        <button
          type="button"
          aria-label="Reset"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          onClick={onReset}
        >
          <ArrowCounterclockwise size={16} />
        </button>
      </div>

      {/* Every control together; the explanation of the one asked about
          opens under them. */}
      <div ref={chips} className="relative flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            "clubFaceAngle",
            "clubPathAngle",
            "strike",
            "aim",
            "attackAngle",
            "loftChange",
          ]
            .filter(shows)
            .map((control) => (
              <ValueChip key={control} {...chipProps(control)} />
            ))}
        </div>
        {/* Swing speed, and beside it the club it is swung with. */}
        <div className="grid grid-cols-2 gap-2">
          <ValueChip {...chipProps("swingSpeed")} />
          <ClubMenu club={club} onClub={onClub} />
        </div>
        {about && (
          <p
            id="control-info"
            role="note"
            className="absolute inset-x-0 top-full z-40 mt-2 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-xs leading-snug text-white/90 shadow-lg"
          >
            <span
              className="font-bold"
              style={{ color: describe[about].colour }}
            >
              {describe[about].name}.{" "}
            </span>
            {describe[about].info}
          </p>
        )}
      </div>
      <p
        className="hidden text-center text-[10px] leading-tight text-white/45 md:block"
        data-key-hint
      >
        ←↑↓→ move · ⌘←→ number · ⌘↑↓ word · Space hit
      </p>

      {/* The club at impact, twice. Left off on phones, where the boxes are
          the controls and the pictures would push them off the screen. */}
      {views && (
        <>
          <Pad3D
            name="Club from above"
            key={`top-${club.id}`}
            caption={`Above ×${GAIN.face}`}
            options={topOptions}
            setup={topSetup}
            className="h-[clamp(150px,22dvh,230px)]"
            onScene={onTopScene}
          >
            {inOrder(
              ["strike", "clubPathAngle", "clubFaceAngle", "aim"].filter(shows),
            ).map((control) => handle(control, boundsOf(scenes.current.top)))}
          </Pad3D>
          {(shows("attackAngle") || shows("loftChange")) && (
            <Pad3D
              name="Club from the side"
              key={`side-${club.id}`}
              caption={`Toe ×${GAIN.attack}`}
              options={sideOptions}
              setup={sideSetup}
              className="h-[clamp(96px,13dvh,140px)]"
              note={`launch ${launch.launchAngleDegrees.toFixed(1)}° · ${Math.round(
                launch.backspinRPM,
              )} rpm`}
              // keep it clear of the attack handle, which swaps sides with the golfer
              noteOnLeft={mirror < 0}
              onScene={onSideScene}
            >
              {inOrder(["attackAngle", "loftChange"].filter(shows)).map(
                (control) => handle(control, boundsOf(scenes.current.side)),
              )}
            </Pad3D>
          )}
        </>
      )}
    </div>
  );
};

export default ClubPads;
