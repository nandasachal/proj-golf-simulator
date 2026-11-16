import React, { useState } from "react";
import {
  ArrowCounterclockwise,
  Check,
  PlayFill,
  ShareFill,
} from "react-bootstrap-icons";
import toast from "react-hot-toast";
import { SHORTCUTS, keyLabel } from "../../utils/shortcuts";

const secondary =
  "flex items-center justify-center rounded-lg bg-white/10 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white";

export const HitButton = ({ onClick, className = "" }) => (
  <button
    type="button"
    className={`flex items-center justify-center rounded-lg bg-lime-400 text-base font-bold text-slate-900 transition-colors hover:bg-lime-300 active:bg-lime-500 ${className}`}
    onClick={onClick}
    aria-keyshortcuts={keyLabel(SHORTCUTS.hit)}
    data-tooltip-id="main-tooltip"
    data-tooltip-content={`Key: ${keyLabel(SHORTCUTS.hit)}`}
  >
    <PlayFill size={20} className="mr-1" />
    Hit
  </button>
);

// Share and Reset, with Hit above them when it isn't shown beside the result
// bar (phones).
const ButtonRow = ({ handleReset, simulate, showHit = true }) => {
  const [isCopied, setIsCopied] = useState(false);
  const handleCopyURL = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    toast.success("Share link copied");
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div className="mt-4">
      {showHit && (
        <HitButton onClick={simulate} className="mb-2 w-full py-2.5" />
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondary} onClick={handleCopyURL}>
          {isCopied ? (
            <Check size={16} className="mr-1" />
          ) : (
            <ShareFill size={12} className="mr-1.5" />
          )}
          {isCopied ? "Copied" : "Share"}
        </button>
        <button
          type="button"
          className={secondary}
          onClick={handleReset}
          aria-keyshortcuts={keyLabel(SHORTCUTS.reset)}
          data-tooltip-id="main-tooltip"
          data-tooltip-content={`Key: ${keyLabel(SHORTCUTS.reset)}`}
        >
          <ArrowCounterclockwise size={14} className="mr-1.5" />
          Reset
        </button>
      </div>
    </div>
  );
};

export default ButtonRow;
