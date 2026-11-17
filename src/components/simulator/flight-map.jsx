import React, { useState } from "react";
import { ChevronDown } from "react-bootstrap-icons";
import { mapLength } from "../../simulate/shot-track";

const HALF_WIDTH = 80; // yards shown either side of the centre line
const FAIRWAY_HALF_WIDTH = 60;
const BEHIND_TEE = 12;

// Downrange is up the map, so y is minus the distance.
const path = (points) =>
  points.map(([right, downrange]) => `${right},${-downrange}`).join(" ");

// The last shot from straight above: the range, the flight, the run, and the
// target it was hit at. Shown under the game card once a shot has finished;
// the heading folds it away.
const FlightMap = ({ result, startOpen = true }) => {
  const [open, setOpen] = useState(startOpen);
  const track = result?.track;
  if (!track) return null;

  const length = mapLength(track);
  const lines = [];
  for (let yards = 50; yards < length; yards += 50) lines.push(yards);
  const landing = track.air[track.air.length - 1];
  const rest = track.run.length ? track.run[track.run.length - 1] : landing;

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
          {Math.round(result.totalYards)} yd
          <ChevronDown
            size={11}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <svg
          viewBox={`${-HALF_WIDTH} ${-length} ${HALF_WIDTH * 2} ${length + BEHIND_TEE}`}
          className="mt-1.5 block h-[96px] w-full md:mt-2 md:h-[230px]"
          role="img"
          aria-label={`${result.shape}: ${Math.round(result.totalYards)} yards, ${
            Math.round(Math.abs(result.offlineYards)) === 0
              ? "on line"
              : `${Math.round(Math.abs(result.offlineYards))} yards ${
                  result.offlineYards > 0 ? "right" : "left"
                }`
          }`}
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
              r={track.target.radius}
              fill={
                result.target?.hit
                  ? "rgba(163,230,53,0.35)"
                  : "rgba(252,211,77,0.18)"
              }
              stroke={result.target?.hit ? "#a3e635" : "#fcd34d"}
              strokeWidth="1.5"
              strokeDasharray={track.target.air ? "4 3" : undefined}
            />
          )}

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
          {/* where it landed, where it stopped, and the tee */}
          <circle
            cx={landing[0]}
            cy={-landing[1]}
            r="3"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.4"
          />
          <circle cx={rest[0]} cy={-rest[1]} r="3.4" fill="#ffffff" />
          <circle cx="0" cy="0" r="2.6" fill="#0b1a12" stroke="#ffffff" />
        </svg>
      )}
    </div>
  );
};

export default FlightMap;
