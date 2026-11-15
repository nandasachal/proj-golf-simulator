import React from "react";

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
const ShotReadout = ({ live, result }) => {
  if (!live && !result) return null;
  const distance = result ? result.totalYards : live.distanceYards;

  return (
    <div
      className="hud-panel flex max-w-full items-center gap-2.5 overflow-x-auto px-3 py-2 md:gap-6 md:px-5"
      role="status"
      aria-label="Shot result"
    >
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
        <dl className="flex shrink-0 gap-2.5 border-l border-white/10 pl-2.5 md:gap-6 md:pl-6">
          <Stat label="Carry" value={`${Math.round(result.carryYards)} yd`} />
          <Stat label="Run" value={`${Math.round(result.runYards)} yd`} />
          <Stat label="Offline" value={describeOffline(result.offlineYards)} />
          <Stat
            label="Apex"
            value={`${Math.round(result.apexYards * FEET_PER_YARD)} ft`}
          />
        </dl>
      )}
    </div>
  );
};

export default ShotReadout;
