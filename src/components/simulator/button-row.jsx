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

// Practice or a game. On laptops it closes the shot panel; on phones it is a
// bar fixed to the bottom of the screen, with Hit beside it.
const ButtonRow = ({ mode, onMode, simulate, bar = false }) => (
  <div
    className={
      bar
        ? "fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-2 border-t border-white/10 bg-slate-950/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
        : "mt-2"
    }
  >
    <div
      className={bar ? "min-w-0 flex-1" : undefined}
      data-tooltip-id="main-tooltip"
      data-tooltip-content="A game is 10 targets, one shot at each. Normal: rings on the ground, hit 5 to win. Advanced: targets in the air, hit 8."
    >
      <Segmented
        label="Mode"
        accent
        size={bar ? "h-full text-[13px]" : "text-sm"}
        options={[
          ["practice", "Practice"],
          ["normal", "Normal", "Game Mode"],
          ["advanced", "Advanced", "Game Mode"],
        ]}
        value={mode}
        onChange={onMode}
      />
    </div>
    {bar && <HitButton onClick={simulate} className="w-24 shrink-0" />}
  </div>
);

export default ButtonRow;
