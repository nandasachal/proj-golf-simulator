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

// Live carry while the ball is in the air, then the full result once it lands.
const ShotReadout = ({ live, result }) => {
  if (!live && !result) return null;
  const carry = result ? result.carryYards : live.carryYards;

  return (
    <div
      className="hud-panel min-w-[150px] px-3 py-2.5 md:px-4 md:py-3"
      role="status"
      aria-label="Shot result"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-lime-300">
        {result ? result.shape : "In the air"}
      </p>
      <p className="mt-0.5 leading-none">
        <span
          id="distance-display"
          className="text-3xl font-bold tabular-nums md:text-4xl"
        >
          {Math.round(carry)}
        </span>
        <span className="ml-1.5 text-sm text-white/60">yd carry</span>
      </p>
      {result && (
        <dl className="mt-2.5 flex gap-4 border-t border-white/10 pt-2">
          <Stat label="Offline" value={describeOffline(result.offlineYards)} />
          <Stat
            label="Apex"
            value={`${Math.round(result.apexYards * FEET_PER_YARD)} ft`}
          />
          <Stat label="Hang" value={`${result.flightSeconds.toFixed(1)} s`} />
        </dl>
      )}
    </div>
  );
};

export default ShotReadout;
