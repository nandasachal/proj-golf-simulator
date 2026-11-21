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

const MODES = [
  {
    id: "practice",
    name: "Practice",
    about: "About practice",
    info: "No targets and nothing is scored. Hit as many shots as you like to learn what each control does.",
  },
  {
    id: "game",
    name: "Game",
    about: "About the game",
    info: "5 targets, one shot at each. Normal: the ball has to touch the circle at the foot of a beam; hit 3 to win. Advanced: it has to fly through a small sphere in the air; hit 4 to win. Switch between them on the game card.",
  },
];

// Practice or a game (its difficulty is chosen on the game card), each with an (i) that says what it is when clicked. On
// laptops it closes the shot panel; on phones it is a bar fixed to the bottom
// of the screen, with Hit beside it.
const ButtonRow = ({ mode, onMode, simulate, bar = false, beckon = false }) => {
  const chosenId = mode === "practice" ? "practice" : "game";
  const [about, setAbout] = useState(null);
  const row = useRef(null);
  const open = MODES.find(({ id }) => id === about);
  // A click anywhere else, or Escape, puts the explanation away.
  useEffect(() => {
    if (!about) return undefined;
    const away = (event) => {
      if (!row.current?.contains(event.target)) setAbout(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") setAbout(null);
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
          : "mt-2"
      }
    >
      <div ref={row} className={`relative ${bar ? "min-w-0 flex-1" : ""}`}>
        {open && (
          <p
            id="mode-info"
            role="note"
            className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-xs leading-snug text-white/90 shadow-lg"
          >
            <span className="font-bold text-lime-300">{open.name}. </span>
            {open.info}
          </p>
        )}
        <div
          className={`grid grid-cols-2 rounded-lg bg-white/10 p-1 ${
            bar ? "h-full text-[13px]" : "text-sm"
          }`}
          role="group"
          aria-label="Mode"
        >
          {MODES.map(({ id, name, about: label }) => {
            const chosen = chosenId === id;
            return (
              <div key={id} className="relative flex">
                <button
                  type="button"
                  aria-pressed={chosen}
                  className={classNames(
                    // Room on the right for the (i).
                    "flex flex-1 flex-col items-center justify-center rounded-md py-2 pl-1 pr-4 font-medium leading-tight transition-colors",
                    chosen
                      ? "bg-lime-400 text-slate-900"
                      : "text-white/70 hover:text-white",
                  )}
                  onClick={() => onMode(id)}
                >
                  {name}
                </button>
                <button
                  type="button"
                  aria-label={label}
                  aria-expanded={about === id}
                  aria-controls="mode-info"
                  className={classNames(
                    "absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full",
                    chosen
                      ? "text-slate-900/60 hover:text-slate-900"
                      : "text-white/50 hover:text-white",
                  )}
                  onClick={() => {
                    if (about !== id) track("info_opened", { topic: id });
                    setAbout(about === id ? null : id);
                  }}
                >
                  <InfoCircle size={11} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
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
