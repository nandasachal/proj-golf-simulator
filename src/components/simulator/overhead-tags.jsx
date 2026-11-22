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
// not overhead (or still moving).
const OverheadTags = ({ marks, result, target }) => {
  if (!marks) return null;
  const tags = [];
  if (result && marks.landing) {
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
  if (target && marks.target)
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
