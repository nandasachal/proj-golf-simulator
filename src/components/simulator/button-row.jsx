import React from "react";
import { PlayFill } from "react-bootstrap-icons";
import { Segmented } from "./settings-modal";

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

// Practice or a game, with Hit above it when it isn't shown beside the result
// bar (phones).
const ButtonRow = ({ mode, onMode, simulate, showHit = true }) => (
  <div className="mt-3">
    {showHit && <HitButton onClick={simulate} className="mb-2 w-full py-2.5" />}
    <div
      data-tooltip-id="main-tooltip"
      data-tooltip-content="A game is 10 targets, one shot at each. Normal: rings on the ground, hit 5 to win. Advanced: targets in the air, hit 8."
    >
      <Segmented
        label="Mode"
        accent
        options={[
          ["practice", "Practice"],
          ["normal", "Normal"],
          ["advanced", "Advanced"],
        ]}
        value={mode}
        onChange={onMode}
      />
    </div>
  </div>
);

export default ButtonRow;
