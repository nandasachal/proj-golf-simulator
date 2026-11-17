import React from "react";
import { ArrowCounterclockwise, PlayFill } from "react-bootstrap-icons";

const secondary =
  "flex items-center justify-center rounded-lg bg-white/10 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white";

export const HitButton = ({ onClick, className = "" }) => (
  <button
    type="button"
    className={`flex items-center justify-center rounded-lg bg-lime-400 text-base font-bold text-slate-900 transition-colors hover:bg-lime-300 active:bg-lime-500 ${className}`}
    onClick={onClick}
    aria-keyshortcuts="Space"
    data-tooltip-id="main-tooltip"
    data-tooltip-content="Key: Space"
  >
    <PlayFill size={20} className="mr-1" />
    Hit
  </button>
);

// Reset, with Hit above it when it isn't shown beside the result bar (phones).
const ButtonRow = ({ handleReset, simulate, showHit = true }) => (
  <div className="mt-3">
    {showHit && <HitButton onClick={simulate} className="mb-2 w-full py-2.5" />}
    <button
      type="button"
      className={`${secondary} w-full`}
      onClick={handleReset}
      data-tooltip-id="main-tooltip"
      data-tooltip-content="Back to the default shot for this club"
    >
      <ArrowCounterclockwise size={14} className="mr-1.5" />
      Reset
    </button>
  </div>
);

export default ButtonRow;
