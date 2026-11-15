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
      className="hud-panel min-w-[150px] px-3 py-2.5 md:px-4 md:py-3"
      role="status"
      aria-label="Shot result"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-lime-300">
        {result ? result.shape : liveLabel(live)}
      </p>
      <p className="mt-0.5 leading-none">
        <span
          id="distance-display"
          className="text-3xl font-bold tabular-nums md:text-4xl"
        >
          {Math.round(distance)}
        </span>
        <span className="ml-1.5 text-sm text-white/60">
          {result ? "yd total" : "yd"}
        </span>
      </p>
      {result && (
        <dl className="mt-2.5 flex gap-4 border-t border-white/10 pt-2">
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
