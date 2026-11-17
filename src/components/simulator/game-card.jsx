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
  <ol className="mt-1.5 flex gap-[3px] md:mt-2 md:gap-1" aria-label="Targets">
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
          className={`flex h-2.5 w-2.5 items-center justify-center rounded-full text-[10px] font-bold leading-none md:h-[18px] md:w-[18px] ${
            shot
              ? shot.hit
                ? "bg-lime-400 text-slate-900"
                : "bg-rose-400/70 text-rose-300 md:bg-white/10"
              : current
                ? "animate-pulse border border-amber-300 md:border-2"
                : "border border-white/20"
          }`}
        >
          {shot && (
            <span className="hidden md:inline">{shot.hit ? "✓" : "✕"}</span>
          )}
        </li>
      );
    })}
  </ol>
);

// Game mode, top right: the target that is up, progress toward the goal,
// every shot of the game, and the games won this session. On phones it is a
// small card: the target, the pips and the score.
const GameCard = ({ mode, goal, target, round, session, onRestart }) => {
  const hits = round.filter((shot) => shot.hit).length;
  const over = round.length >= goal.targets;
  const won = hits >= goal.toWin;
  const state = standing(hits, goal.targets - round.length, goal.toWin);
  let streak = 0;
  for (let i = round.length - 1; i >= 0 && round[i].hit; i--) streak++;

  return (
    <div
      className="hud-panel w-[150px] whitespace-nowrap px-2.5 py-2 md:w-[268px] md:px-4 md:py-3"
      role="status"
      aria-label="Game"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 md:text-[11px]">
          {TITLES[mode]}
        </p>
        <p className="hidden text-[11px] tabular-nums text-white/50 md:block">
          {over ? "Finished" : `Target ${round.length + 1} of ${goal.targets}`}
        </p>
      </div>

      {over ? (
        <div className="mt-1.5">
          <p
            className={`text-lg font-bold leading-tight md:text-3xl ${
              won ? "text-lime-300" : "text-white"
            }`}
          >
            {won ? "You win!" : "Not this time"}
          </p>
          <p className="text-[11px] text-white/60 md:text-sm">
            {hits} of {goal.targets} hit · {goal.toWin} to win
          </p>
        </div>
      ) : (
        target && (
          <p className="mt-1 leading-none">
            <span className="text-xl font-bold tabular-nums md:text-3xl">
              {target.distanceYards}
            </span>
            <span className="ml-1 text-[11px] text-white/60 md:ml-1.5 md:text-sm">
              yd
            </span>
            <span className="mt-1 block text-[11px] text-white/60 md:ml-1.5 md:mt-0 md:inline md:text-sm">
              <span className="hidden md:inline">· </span>
              {describeSide(target.offlineYards)}
              {target.air && ` · ${target.heightYards} yd up`}
            </span>
          </p>
        )
      )}

      <Pips round={round} total={goal.targets} playing={!over} />
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums md:text-xs">
        <p className="font-semibold">
          {hits} hit
          <span className="font-normal text-white/50">
            {" "}
            / {goal.toWin} to win
          </span>
        </p>
        {!over && (
          <p className={`hidden md:block ${state.tone}`}>{state.text}</p>
        )}
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

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 md:mt-2.5 md:gap-3 md:pt-2">
        <p className="hidden text-xs tabular-nums text-white/70 md:block">
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
              : "ml-auto text-[11px] font-semibold text-lime-300 hover:text-lime-200 md:text-xs"
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
