import React from "react";
import { X } from "react-bootstrap-icons";

const FEET_PER_YARD = 3;

export const describeOffline = (yards) => {
  const rounded = Math.round(Math.abs(yards));
  if (rounded === 0) return "On line";
  return `${rounded} yd ${yards > 0 ? "right" : "left"}`;
};

const Stat = ({ label, value }) => (
  <div>
    <dt className="text-[10px] uppercase tracking-wider text-white/50 md:text-[11px]">
      {label}
    </dt>
    <dd className="whitespace-nowrap text-xs font-semibold tabular-nums md:text-sm">
      {value}
    </dd>
  </div>
);

const liveLabel = (live) => (live.onGround ? "On the ground" : "In the air");

// Live distance while the ball is moving, then the full result once it stops.
// With `onClose` (given once the view is back behind the golfer) a small x
// at the end of the bar puts the result away; `leaving` is how many ms until
// it goes by itself, shown as a thin line along the foot of the bar that
// runs down.
const ShotReadout = ({ live, result, leaving = null, onClose }) => {
  if (!live && !result) return null;
  const distance = result ? result.totalYards : live.distanceYards;

  return (
    <div
      className="hud-panel relative flex max-w-full overflow-hidden"
      role="status"
      aria-label="Shot result"
    >
      <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto px-3 py-2 md:gap-4 md:px-4">
        <div className="shrink-0">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-lime-300 md:text-[11px]">
            {result ? result.shape : liveLabel(live)}
          </p>
          <p className="whitespace-nowrap leading-none">
            <span
              id="distance-display"
              className="text-2xl font-bold tabular-nums md:text-3xl"
            >
              {Math.round(distance)}
            </span>
            <span className="ml-1.5 text-xs text-white/60 md:text-sm">
              {result ? "yd total" : "yd"}
            </span>
          </p>
        </div>
        {result && (
          <dl className="flex shrink-0 gap-2.5 border-l border-white/10 pl-2.5 md:gap-4 md:pl-4">
            <Stat label="Carry" value={`${Math.round(result.carryYards)} yd`} />
            <Stat label="Run" value={`${Math.round(result.runYards)} yd`} />
            <Stat
              label="Offline"
              value={describeOffline(result.offlineYards)}
            />
            <Stat
              label="Apex"
              value={`${Math.round(result.apexYards * FEET_PER_YARD)} ft`}
            />
          </dl>
        )}
      </div>
      {result && onClose && (
        <button
          type="button"
          aria-label="Close shot result"
          title="Close"
          className="mr-1 mt-1 flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      {result && leaving != null && (
        <span
          aria-hidden="true"
          data-shot-countdown
          className="shot-countdown pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-lime-300/60 md:h-1"
          style={{ animationDuration: `${leaving}ms` }}
        />
      )}
    </div>
  );
};

export default ShotReadout;
