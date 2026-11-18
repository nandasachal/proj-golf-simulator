import React, { useEffect, useState } from "react";
import { ChevronDown } from "react-bootstrap-icons";
import { mapLength } from "../../simulate/shot-track";

const HALF_WIDTH = 80; // yards shown either side of the centre line
const FAIRWAY_HALF_WIDTH = 60;
const BEHIND_TEE = 12;

// Downrange is up the map, so y is minus the distance.
const path = (points) =>
  points.map(([right, downrange]) => `${right},${-downrange}`).join(" ");

const FEET_PER_YARD = 3;
const NO_TRACK = { air: [], run: [], target: null };

const offline = (yards) => {
  const rounded = Math.round(Math.abs(yards));
  if (rounded === 0) return "on line";
  return `${rounded} yd ${yards > 0 ? "right" : "left"}`;
};

const Stat = ({ label, value }) => (
  <div>
    <dt className="text-[9px] uppercase tracking-wider text-white/50 md:text-[10px]">
      {label}
    </dt>
    <dd className="whitespace-nowrap text-[11px] font-semibold tabular-nums md:text-xs">
      {value}
    </dd>
  </div>
);

const TAB =
  "flex-1 rounded px-1 py-0.5 text-[10px] font-semibold md:text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400";

// The range from straight above. In a game it has two views: the current
// shot (the target that is up, before it is hit at) and the previous shot
// (its flight, run and numbers). In practice there is only the last shot.
// The heading folds it away.
const FlightMap = ({ result, target = null, startOpen = true }) => {
  const [open, setOpen] = useState(startOpen);
  const [view, setView] = useState("current");
  const shot = result?.track ? result : null;
  // A shot that has just stopped is what to look at; a new target is next.
  useEffect(() => {
    if (shot) setView("previous");
  }, [shot]);
  useEffect(() => {
    if (target) setView("current");
  }, [target]);
  if (!shot && !target) return null;

  const showing = !target ? "previous" : !shot ? "current" : view;
  const previous = showing === "previous";
  const track = previous
    ? shot.track
    : {
        ...NO_TRACK,
        target: {
          right: -target.x,
          downrange: target.z,
          radius: target.radius,
          air: Boolean(target.air),
        },
      };
  const marked = previous ? result.target : null;

  const length = mapLength(track);
  const lines = [];
  for (let yards = 50; yards < length; yards += 50) lines.push(yards);
  const landing = track.air[track.air.length - 1];
  const rest = track.run.length ? track.run[track.run.length - 1] : landing;
  const label = previous
    ? `${result.shape}: ${Math.round(result.totalYards)} yards, ${
        Math.round(Math.abs(result.offlineYards)) === 0
          ? "on line"
          : `${Math.round(Math.abs(result.offlineYards))} yards ${
              result.offlineYards > 0 ? "right" : "left"
            }`
      }`
    : `Target: ${target.distanceYards} yards, ${offline(target.offlineYards)}${
        target.air ? `, ${target.heightYards} yards up` : ""
      }`;

  return (
    <div
      className="hud-panel w-[150px] px-2.5 py-2 md:w-[268px] md:px-4 md:py-3"
      role="region"
      aria-label="Bird's-eye view"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 md:text-[11px]">
          Bird&rsquo;s-eye
        </span>
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-white/60">
          {previous
            ? `${Math.round(result.totalYards)} yd`
            : `${target.distanceYards} yd`}
          <ChevronDown
            size={11}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && target && (
        <div
          className="mt-1.5 flex gap-1 rounded-md bg-white/10 p-0.5"
          role="group"
          aria-label="Which shot"
        >
          {[
            ["previous", "Previous shot"],
            ["current", "Current shot"],
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              className={`${TAB} ${
                showing === id
                  ? "bg-white text-black"
                  : "text-white/70 hover:text-white disabled:text-white/30"
              }`}
              aria-pressed={showing === id}
              disabled={id === "previous" && !shot}
              onClick={() => setView(id)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {open && (
        <svg
          viewBox={`${-HALF_WIDTH} ${-length} ${HALF_WIDTH * 2} ${length + BEHIND_TEE}`}
          className="mt-1.5 block h-[96px] w-full md:mt-2 md:h-[230px]"
          role="img"
          aria-label={label}
        >
          {/* rough, then the fairway */}
          <rect
            x={-HALF_WIDTH}
            y={-length}
            width={HALF_WIDTH * 2}
            height={length + BEHIND_TEE}
            rx="6"
            fill="#2f6b2c"
          />
          <rect
            x={-FAIRWAY_HALF_WIDTH}
            y={-length}
            width={FAIRWAY_HALF_WIDTH * 2}
            height={length + BEHIND_TEE - 4}
            rx="5"
            fill="#55a544"
          />
          {lines.map((yards) => (
            <g key={yards}>
              <line
                x1={-FAIRWAY_HALF_WIDTH}
                x2={FAIRWAY_HALF_WIDTH}
                y1={-yards}
                y2={-yards}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.8"
              />
              <text
                x={-HALF_WIDTH + 3}
                y={-yards + 4}
                fontSize="11"
                fontWeight="600"
                fill="rgba(255,255,255,0.75)"
              >
                {yards}
              </text>
            </g>
          ))}
          <line
            x1="0"
            x2="0"
            y1="0"
            y2={-length}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="0.8"
            strokeDasharray="3 5"
          />

          {track.target && (
            <circle
              data-map="target"
              cx={track.target.right}
              cy={-track.target.downrange}
              // An air target is too small to see at this scale.
              r={Math.max(track.target.radius, 5)}
              fill={
                marked?.hit ? "rgba(163,230,53,0.35)" : "rgba(252,211,77,0.18)"
              }
              stroke={marked?.hit ? "#a3e635" : "#fcd34d"}
              strokeWidth="1.5"
              strokeDasharray={track.target.air ? "4 3" : undefined}
            />
          )}

          {previous && (
            <>
              <polyline
                data-map="flight"
                points={path(track.air)}
                fill="none"
                stroke="#ff4d2e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {track.run.length > 1 && (
                <polyline
                  data-map="run"
                  points={path(track.run)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeDasharray="1 4"
                  strokeLinecap="round"
                />
              )}
              {/* where it landed and where it stopped */}
              <circle
                cx={landing[0]}
                cy={-landing[1]}
                r="3"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.4"
              />
              <circle cx={rest[0]} cy={-rest[1]} r="3.4" fill="#ffffff" />
            </>
          )}
          <circle cx="0" cy="0" r="2.6" fill="#0b1a12" stroke="#ffffff" />
        </svg>
      )}

      {open &&
        (previous ? (
          <dl
            className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 md:grid-cols-4"
            data-map="stats"
          >
            <Stat label="Carry" value={`${Math.round(result.carryYards)} yd`} />
            <Stat label="Run" value={`${Math.round(result.runYards)} yd`} />
            <Stat label="Offline" value={offline(result.offlineYards)} />
            <Stat
              label="Apex"
              value={`${Math.round(result.apexYards * FEET_PER_YARD)} ft`}
            />
          </dl>
        ) : (
          <dl
            className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 md:grid-cols-3"
            data-map="stats"
          >
            <Stat label="Target" value={`${target.distanceYards} yd`} />
            <Stat label="Line" value={offline(target.offlineYards)} />
            {target.air && (
              <Stat
                label="Altitude"
                value={`${target.heightYards} yd · ${Math.round(target.y * FEET_PER_YARD)} ft`}
              />
            )}
          </dl>
        ))}
    </div>
  );
};

export default FlightMap;
