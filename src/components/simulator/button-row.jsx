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
    info: "No targets and nothing is scored. Hit as many shots as you like to learn what each control does.",
  },
  {
    id: "game",
    name: "Game",
    info: "5 targets, one shot at each. Easy: the ball has to touch the circle at the foot of a beam, with any club and any shot; hit 3 to win. Medium: the same circle, but each target names the club you must use and the shape you must hit (a draw, a fade or straight), and only that counts; hit 3 to win. Hard: the club and shape are named too, and the ball has to fly through a small sphere in the air; hit 4 to win. A draw curves left and a fade right (the other way round left-handed), wherever the ball starts. Switch between them on the game card.",
  },
];

// Phones: Hit, full width in a bar fixed to the bottom of the screen. A
// game's difficulty is in the game row.
export const PhoneBar = ({ simulate, beckon = false }) => (
  <div className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-slate-950/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
    <HitButton onClick={simulate} beckon={beckon} className="h-11 flex-1" />
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
