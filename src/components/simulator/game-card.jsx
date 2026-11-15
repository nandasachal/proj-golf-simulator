import React from "react";
import { describeMiss } from "../../simulate/game";

const describeSide = (offlineYards) => {
  if (offlineYards === 0) return "on the centre line";
  return `${Math.abs(offlineYards)} yd ${offlineYards > 0 ? "right" : "left"}`;
};

// Game mode: the current target, the score, and how the last shot did.
const GameCard = ({ target, score, outcome, onNewTarget }) => (
  <div
    className="hud-panel min-w-[150px] px-3 py-2.5 md:px-4 md:py-3"
    role="status"
    aria-label="Game"
  >
    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
      Target
    </p>
    <p className="mt-0.5 leading-none">
      <span className="text-2xl font-bold tabular-nums md:text-3xl">
        {target.distanceYards}
      </span>
      <span className="ml-1.5 text-sm text-white/60">
        yd · {describeSide(target.offlineYards)}
      </span>
    </p>
    {outcome && (
      <p
        className={`mt-2 text-sm font-semibold ${
          outcome.hit ? "text-lime-300" : "text-white/80"
        }`}
      >
        {outcome.hit ? "Hit!" : `Missed: ${describeMiss(outcome)}`}
      </p>
    )}
    <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-white/10 pt-2">
      <p className="text-xs tabular-nums text-white/70">
        {score.hits} of {score.attempts} hit · streak {score.streak}
      </p>
      <button
        type="button"
        className="text-xs font-semibold text-lime-300 hover:text-lime-200"
        onClick={onNewTarget}
      >
        New target
      </button>
    </div>
  </div>
);

export default GameCard;
