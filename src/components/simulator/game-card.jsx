import React from "react";

const describeSide = (offlineYards) => {
  if (offlineYards === 0) return "on the centre line";
  return `${Math.abs(offlineYards)} yd ${offlineYards > 0 ? "right" : "left"}`;
};

const TITLES = { normal: "Normal game", advanced: "Advanced game" };

// Where the game stands against its goal, in a few words.
function standing(hits, left, toWin) {
  if (hits >= toWin) return { text: "Goal reached", tone: "text-lime-300" };
  const needed = toWin - hits;
  if (needed > left)
    return { text: `Out of reach: needed ${toWin}`, tone: "text-rose-300" };
  return {
    text: `${needed} more to win · ${left} left`,
    tone: "text-white/70",
  };
}

// One pip per target: filled for a hit, crossed for a miss, a ring for the
// one being played, faint for those still to come.
const Pips = ({ round, total, playing }) => (
  <ol className="mt-2 flex gap-1" aria-label="Targets">
    {Array.from({ length: total }, (_, i) => {
      const shot = round[i];
      const current = !shot && playing && i === round.length;
      return (
        <li
          key={i}
          aria-label={`Target ${i + 1}: ${
            shot
              ? shot.hit
                ? "hit"
                : "missed"
              : current
                ? "up now"
                : "to come"
          }`}
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold leading-none ${
            shot
              ? shot.hit
                ? "bg-lime-400 text-slate-900"
                : "bg-white/10 text-rose-300"
              : current
                ? "animate-pulse border-2 border-amber-300"
                : "border border-white/20"
          }`}
        >
          {shot ? (shot.hit ? "✓" : "✕") : ""}
        </li>
      );
    })}
  </ol>
);

// Game mode, top right: the target that is up, progress toward the goal,
// every shot of the game, and the games won this session.
const GameCard = ({ mode, goal, target, round, session, onRestart }) => {
  const hits = round.filter((shot) => shot.hit).length;
  const over = round.length >= goal.targets;
  const won = hits >= goal.toWin;
  const state = standing(hits, goal.targets - round.length, goal.toWin);
  let streak = 0;
  for (let i = round.length - 1; i >= 0 && round[i].hit; i--) streak++;

  return (
    <div
      className="hud-panel w-[248px] whitespace-nowrap px-3 py-2.5 md:w-[268px] md:px-4 md:py-3"
      role="status"
      aria-label="Game"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          {TITLES[mode]}
        </p>
        <p className="text-[11px] tabular-nums text-white/50">
          {over ? "Finished" : `Target ${round.length + 1} of ${goal.targets}`}
        </p>
      </div>

      {over ? (
        <div className="mt-1.5">
          <p
            className={`text-2xl font-bold leading-tight md:text-3xl ${
              won ? "text-lime-300" : "text-white"
            }`}
          >
            {won ? "You win!" : "Not this time"}
          </p>
          <p className="text-sm text-white/60">
            {hits} of {goal.targets} hit · {goal.toWin} to win
          </p>
        </div>
      ) : (
        target && (
          <p className="mt-1 leading-none">
            <span className="text-2xl font-bold tabular-nums md:text-3xl">
              {target.distanceYards}
            </span>
            <span className="ml-1.5 text-sm text-white/60">
              yd · {describeSide(target.offlineYards)}
              {target.air && ` · ${target.heightYards} yd up`}
            </span>
          </p>
        )
      )}

      <Pips round={round} total={goal.targets} playing={!over} />
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <p className="font-semibold">
          {hits} hit
          <span className="font-normal text-white/50">
            {" "}
            / {goal.toWin} to win
          </span>
        </p>
        {!over && <p className={state.tone}>{state.text}</p>}
      </div>

      {round.length > 0 && (
        <ol
          className="mt-2 hidden max-h-[132px] flex-col gap-0.5 overflow-y-auto border-t border-white/10 pt-2 text-xs md:flex"
          aria-label="Shots this game"
        >
          {round
            .map((shot, i) => ({ ...shot, number: i + 1 }))
            .reverse()
            .map((shot) => (
              <li key={shot.number} className="flex gap-2 tabular-nums">
                <span className="w-4 text-right text-white/40">
                  {shot.number}
                </span>
                <span className="w-12 text-white/60">
                  {shot.distanceYards} yd
                </span>
                <span
                  className={
                    shot.hit ? "font-semibold text-lime-300" : "text-white/80"
                  }
                >
                  {shot.hit ? "Hit" : `Missed: ${shot.miss}`}
                </span>
              </li>
            ))}
        </ol>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/10 pt-2">
        <p className="text-xs tabular-nums text-white/70">
          {session.played > 0
            ? `Games won ${session.won} of ${session.played}`
            : `Streak ${streak}`}
          {session.played > 0 && !over && ` · streak ${streak}`}
        </p>
        <button
          type="button"
          className={
            over
              ? "rounded-md bg-lime-400 px-2.5 py-1 text-xs font-bold text-slate-900 hover:bg-lime-300"
              : "text-xs font-semibold text-lime-300 hover:text-lime-200"
          }
          onClick={onRestart}
        >
          {over ? "Play again" : "Restart"}
        </button>
      </div>
    </div>
  );
};

export default GameCard;
