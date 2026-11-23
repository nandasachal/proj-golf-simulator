import React, { useRef } from "react";
import { Dialog } from "@headlessui/react";

const point = (radius, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  return `${(100 + radius * Math.sin(angle)).toFixed(2)} ${(100 - radius * Math.cos(angle)).toFixed(2)}`;
};
// A piece of a ring, between two radii and two bearings.
const sector = (inner, outer, from, to) =>
  `M${point(outer, from)} A${outer} ${outer} 0 0 1 ${point(outer, to)} ` +
  `L${point(inner, to)} A${inner} ${inner} 0 0 0 ${point(inner, from)} Z`;
const SIXTHS = [0, 60, 120, 180, 240, 300];

// The Empire's mark, drawn here: a six-spoked cog inside a ring.
const EmpireMark = () => (
  <svg
    viewBox="0 0 200 200"
    className="h-40 w-40 sm:h-48 sm:w-48"
    role="img"
    aria-label="The mark of the Empire"
  >
    <circle cx="100" cy="100" r="97" fill="#fff" />
    <circle cx="100" cy="100" r="84" fill="#000" />
    <circle cx="100" cy="100" r="73" fill="#fff" />
    {SIXTHS.map((turn) => (
      <React.Fragment key={turn}>
        {/* the windows between the spokes, and the notches in the rim */}
        <path d={sector(27, 58, turn + 12, turn + 48)} fill="#000" />
        <path d={sector(64, 74, turn + 22, turn + 38)} fill="#000" />
      </React.Fragment>
    ))}
    <circle cx="100" cy="100" r="11" fill="#000" />
  </svg>
);

// What Star Wars Mode's battle station leaves behind once it has fired: the
// whole screen, until Exit goes back to the (restarted) game.
export default function EmpireScreen({ open, onExit }) {
  const exit = useRef(null);
  return (
    <Dialog
      open={open}
      onClose={onExit}
      initialFocus={exit}
      className="relative z-50"
    >
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/95 p-6">
        <Dialog.Panel className="flex max-w-md flex-col items-center gap-6 text-center text-white">
          <EmpireMark />
          <div>
            <Dialog.Title className="text-2xl font-bold">
              You made Darth Vader angry.
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-base text-white/75">
              Stop snooping on the Empire and focus on your golf game.
            </Dialog.Description>
          </div>
          <button
            ref={exit}
            type="button"
            className="rounded-xl bg-lime-400 px-8 py-2.5 text-base font-bold text-slate-900 hover:bg-lime-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={onExit}
          >
            Exit
          </button>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
