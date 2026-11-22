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

// On phones the game's difficulty is in the bar at the bottom, since the game
// card is folded into a row there; Practice / Game is at the top.
const DIFFICULTIES = [
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

// Phones: a bar fixed to the bottom of the screen with Hit, and the game's
// difficulty beside it during a game. In practice Hit has the bar to itself.
export const PhoneBar = ({ mode, onMode, simulate, beckon = false }) => (
  <div className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-2 border-t border-white/10 bg-slate-950/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
    {mode !== "practice" && (
      <div
        className="grid min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-lg bg-white/10 p-0.5 text-[13px]"
        role="group"
        aria-label="Difficulty"
      >
        {DIFFICULTIES.map(({ id, name }) => {
          const chosen = mode === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={chosen}
              className={classNames(
                "rounded-md px-1 font-semibold leading-tight transition-colors",
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
    )}
    <HitButton
      onClick={simulate}
      beckon={beckon}
      className={mode === "practice" ? "h-11 flex-1" : "w-24 shrink-0"}
    />
  </div>
);

// Practice or a game, as a two-way switch with one (i) that says what both
// are when clicked. It sits in the top row of the shot panel.
const ButtonRow = ({ mode, onMode }) => {
  const chosenId = mode === "practice" ? "practice" : "game";
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
    <div className="shrink-0">
      <div ref={row} className="relative flex items-center gap-1">
        {about && (
          <div
            id="mode-info"
            role="note"
            className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-xs leading-snug text-white/90 shadow-lg"
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
          className="grid h-8 grid-cols-2 gap-0.5 rounded-lg bg-white/10 p-0.5 text-xs"
          role="group"
          aria-label="Mode"
        >
          {MODES.map(({ id, name }) => {
            const chosen = chosenId === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={chosen}
                className={classNames(
                  "rounded-md px-2 font-semibold leading-tight transition-colors md:px-3",
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
    </div>
  );
};

export default ButtonRow;
