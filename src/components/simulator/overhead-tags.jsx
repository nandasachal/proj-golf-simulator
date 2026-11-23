import React from "react";

// Yards left or right of the line, in a few characters.
const side = (yards) => {
  const rounded = Math.round(yards);
  if (rounded === 0) return "on line";
  return `${Math.abs(rounded)} ${rounded > 0 ? "R" : "L"}`;
};

// The overhead view's numbers, pinned where they happened: carry at the
// landing spot, the run at the stop, the apex over the line, the target on
// its ring. `marks` are screen points from the scene, null when the camera is
// not overhead (or still moving). With both a last shot and a target to
// show, a small switch picks which one's numbers are up (`chosen`, "shot" or
// "target").
const VIEWS = [
  ["shot", "Last shot"],
  ["target", "Target"],
];

const OverheadTags = ({ marks, result, target, chosen, onChoose }) => {
  if (!marks) return null;
  const both = Boolean(result && marks.landing && target && marks.target);
  const showing = both ? chosen : result ? "shot" : "target";
  const tags = [];
  if (showing === "shot" && result && marks.landing) {
    tags.push({
      id: "carry",
      at: marks.landing,
      text: `${Math.round(result.carryYards)} yd carry · ${side(
        result.carryOfflineYards,
      )}`,
      place: "right",
    });
    if (marks.rest && result.runYards >= 1)
      tags.push({
        id: "run",
        at: marks.rest,
        text: `+${Math.round(result.runYards)} run → ${Math.round(
          result.totalYards,
        )} yd`,
        place: "right-below",
        quiet: true,
      });
    if (marks.apex)
      tags.push({
        id: "apex",
        at: marks.apex,
        text: `apex ${Math.round(result.apexYards)} yd`,
        place: "left",
        quiet: true,
      });
  }
  if (showing === "target" && target && marks.target)
    tags.push({
      id: "target",
      at: marks.target,
      text: `Target ${target.distanceYards} yd · ${side(target.offlineYards)}${
        target.air ? ` · ${target.heightYards} up` : ""
      }`,
      place: "left",
      gold: true,
    });

  const offset = {
    right: "translate(12px, -130%)",
    "right-below": "translate(12px, 20%)",
    left: "translate(calc(-100% - 12px), -50%)",
  };
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-label="Overhead view"
      role="group"
    >
      {both && (
        <div
          role="group"
          aria-label="Bird's-eye shows"
          className="pointer-events-auto absolute left-1/2 top-14 flex -translate-x-1/2 gap-0.5 rounded-lg border border-white/15 bg-slate-950/85 p-0.5 text-[11px] font-semibold shadow-lg md:top-4"
        >
          {VIEWS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={showing === id}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                showing === id
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white"
              }`}
              onClick={() => onChoose(id)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {tags.map((tag) => (
        <p
          key={tag.id}
          data-tag={tag.id}
          className={`absolute whitespace-nowrap rounded-lg border px-2 py-1 text-xs tabular-nums shadow-lg ${
            tag.gold
              ? "border-amber-300/60 bg-slate-950/85 font-semibold text-amber-200"
              : tag.quiet
                ? "border-white/15 bg-slate-950/80 font-medium text-white/80"
                : "border-white/20 bg-slate-950/85 font-semibold text-white"
          }`}
          style={{
            left: tag.at.x,
            top: tag.at.y,
            transform: offset[tag.place],
          }}
        >
          {tag.text}
        </p>
      ))}
    </div>
  );
};

export default OverheadTags;
