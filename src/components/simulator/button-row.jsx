import React, { useEffect, useRef, useState } from "react";
import { InfoCircle, PlayFill } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import { track } from "../../analytics";

// `beckon` makes it pulse, for a visitor who has not hit a shot yet.
export const HitButton = ({ onClick, className = "", beckon = false }) => (
  <button
    type="button"
    className={`flex items-center justify-center rounded-lg bg-lime-400 text-base font-bold text-slate-900 transition-colors hover:bg-lime-300 active:bg-lime-500 ${
      beckon ? "hit-beckon" : ""
    } ${className}`}
    onClick={onClick}
    aria-keyshortcuts="Space"
  >
    <PlayFill size={20} className="mr-1" />
    Hit
  </button>
);

// On phones the game's difficulty is in the bar too, since the game card is
// folded into a row there.
const PHONE_MODES = [
  { id: "practice", name: "Practice" },
  { id: "normal", name: "Normal" },
  { id: "advanced", name: "Advanced" },
];

const MODES = [
  {
    id: "practice",
    name: "Practice",
    info: "No targets and nothing is scored. Hit as many shots as you like to learn what each control does.",
  },
  {
    id: "game",
    name: "Game",
    info: "5 targets, one shot at each. Normal: the ball has to touch the circle at the foot of a beam; hit 3 to win. Advanced: it has to fly through a small sphere in the air; hit 4 to win. Switch between them on the game card.",
  },
];

// Practice or a game (its difficulty is chosen on the game card), as a
// two-way switch with one (i) that says what both are when clicked. On
// laptops it sits in the top row of the shot panel; on phones it is a bar
// fixed to the bottom of the screen, with Hit beside it.
const ButtonRow = ({ mode, onMode, simulate, bar = false, beckon = false }) => {
  const chosenId = bar ? mode : mode === "practice" ? "practice" : "game";
  const choices = bar ? PHONE_MODES : MODES;
  const [about, setAbout] = useState(false);
  const row = useRef(null);
  // A click anywhere else, or Escape, puts the explanation away.
  useEffect(() => {
    if (!about) return undefined;
    const away = (event) => {
      if (!row.current?.contains(event.target)) setAbout(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setAbout(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [about]);

  return (
    <div
      className={
        bar
          ? "fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-2 border-t border-white/10 bg-slate-950/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
          : "shrink-0"
      }
    >
      <div
        ref={row}
        className={classNames(
          "relative flex items-center gap-1",
          bar && "min-w-0 flex-1",
        )}
      >
        {about && (
          <div
            id="mode-info"
            role="note"
            className={classNames(
              "absolute z-40 w-72 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-xs leading-snug text-white/90 shadow-lg",
              bar ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2",
            )}
          >
            {MODES.map(({ id, name, info }) => (
              <p key={id} className="[&+&]:mt-1.5">
                <span className="font-bold text-lime-300">{name}. </span>
                {info}
              </p>
            ))}
          </div>
        )}
        <div
          className={classNames(
            "grid gap-0.5 rounded-lg bg-white/10 p-0.5",
            bar ? "grid-cols-3" : "grid-cols-2",
            bar ? "h-full flex-1 text-[13px]" : "h-8 text-xs",
          )}
          role="group"
          aria-label="Mode"
        >
          {choices.map(({ id, name }) => {
            const chosen = chosenId === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={chosen}
                className={classNames(
                  "rounded-md font-semibold leading-tight transition-colors",
                  bar ? "px-1" : "px-3",
                  chosen
                    ? "bg-lime-400 text-slate-900"
                    : "text-white/65 hover:text-white",
                )}
                onClick={() => onMode(id)}
              >
                {name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="About the modes"
          aria-expanded={about}
          aria-controls="mode-info"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-400"
          onClick={() => {
            if (!about) track("info_opened", { topic: "modes" });
            setAbout(!about);
          }}
        >
          <InfoCircle size={12} aria-hidden="true" />
        </button>
      </div>
      {bar && (
        <HitButton
          onClick={simulate}
          beckon={beckon}
          className="w-24 shrink-0"
        />
      )}
    </div>
  );
};

export default ButtonRow;
