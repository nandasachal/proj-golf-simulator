import React, { useState } from "react";
import { Listbox } from "@headlessui/react";
import { ArrowRepeat, Check2, ChevronDown } from "react-bootstrap-icons";
import SaveName from "./save-name";

const describeSide = (offlineYards) => {
  if (offlineYards === 0) return "on the centre line";
  return `${Math.abs(offlineYards)} yd ${offlineYards > 0 ? "right" : "left"}`;
};

const DIFFICULTIES = [
  { id: "normal", name: "Normal", about: "Target on the ground" },
  { id: "advanced", name: "Advanced", about: "Target in the air" },
];

// Phones: the game's difficulty as a small menu in the game row, opening
// upward over the picture. Picking one starts a new game.
const DifficultyMenu = ({ mode, onDifficulty }) => {
  const chosen = DIFFICULTIES.find((entry) => entry.id === mode);
  return (
    <Listbox value={mode} onChange={onDifficulty}>
      <div className="relative">
        <Listbox.Button
          aria-label={`Difficulty: ${chosen.name}`}
          className="flex h-7 items-center gap-1 rounded-lg bg-white/[0.12] px-2 text-xs font-semibold text-white hover:bg-white/20"
        >
          {chosen.name}
          <ChevronDown size={10} aria-hidden="true" className="opacity-70" />
        </Listbox.Button>
        <Listbox.Options className="absolute bottom-full right-0 z-40 mb-2 w-52 rounded-xl border border-white/15 bg-slate-950/95 p-1 text-[13px] shadow-xl focus:outline-none">
          {DIFFICULTIES.map(({ id, name, about }) => (
            <Listbox.Option
              key={id}
              value={id}
              className={({ active }) =>
                `flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 ${
                  active ? "bg-white/10" : ""
                }`
              }
            >
              {({ selected }) => (
                <>
                  <span>
                    <span className="block font-semibold">{name}</span>
                    <span className="block text-[11px] text-white/50">
                      {about}
                    </span>
                  </span>
                  {selected && (
                    <Check2
                      size={14}
                      aria-hidden="true"
                      className="text-lime-400"
                    />
                  )}
                </>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
};

// Where the game stands against its goal, in a few words; `short` fits the
// phone card.
function standing(hits, left, toWin, total) {
  if (hits >= toWin)
    return {
      text: "Goal reached",
      short: "Goal reached",
      tone: "text-lime-300",
    };
  const needed = toWin - hits;
  if (needed > left)
    return {
      text: `Out of reach: needed ${toWin}`,
      short: "Out of reach",
      tone: "text-rose-300",
    };
  if (left === total)
    return {
      text: `Hit ${toWin} of ${total} to win`,
      short: `Hit ${toWin} of ${total} to win`,
      tone: "text-white/80",
    };
  return {
    text: `${needed} more to win · ${left} left`,
    short: `Need ${needed} · ${left} left`,
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

// Where a saved player stands on the all-time board after a game, from the
// leaderboard's answer for them.
function boardLines(board) {
  const me = board?.me;
  if (!me) return [];
  const toGo = board.minAttempts - me.attempts;
  const lines = [
    me.ranked
      ? `Rank ${me.rank} · ${Math.round(me.pct)}% hit`
      : `Warming up: ${toGo} more ${toGo === 1 ? "target" : "targets"} to be ranked`,
  ];
  if (board.passes) {
    const { name, hitsNeeded } = board.passes;
    lines.push(
      hitsNeeded === 1
        ? `One more hit passes ${name}`
        : `${hitsNeeded} more hits pass ${name}`,
    );
  }
  return lines;
}

// Game mode, top right: the target that is up, progress toward the goal,
// every shot of the game, and the games won this session. On phones it is a
// small card: the target, the pips and the score. A finished game asks for a
// name to save it under, and once there is one says where the player stands.
const GameCard = ({
  mode,
  goal,
  target,
  round,
  session,
  onRestart,
  player,
  board,
  onPlayer,
  onDifficulty,
  tip,
}) => {
  const hits = round.filter((shot) => shot.hit).length;
  const over = round.length >= goal.targets;
  const won = hits >= goal.toWin;
  const state = standing(
    hits,
    goal.targets - round.length,
    goal.toWin,
    goal.targets,
  );
  let streak = 0;
  for (let i = round.length - 1; i >= 0 && round[i].hit; i--) streak++;

  return (
    <div
      className="hud-panel w-[150px] whitespace-nowrap px-2.5 py-2 md:w-[268px] md:px-4 md:py-3"
      role="status"
      aria-label="Game"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div
          className="hidden rounded-md bg-white/10 p-0.5 text-[10px] font-semibold uppercase tracking-wider md:flex md:text-[11px]"
          role="group"
          aria-label="Difficulty"
        >
          {DIFFICULTIES.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                mode === id
                  ? "bg-amber-300 text-slate-900"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => onDifficulty(id)}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="text-[10px] tabular-nums text-white/50 md:text-[11px]">
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

      <div className="flex items-end justify-between gap-2">
        <Pips round={round} total={goal.targets} playing={!over} />
        {player && (
          <p
            className="min-w-0 truncate text-[10px] text-white/50 md:text-[11px]"
            aria-label={`Playing as ${player.name}`}
          >
            {player.name}
          </p>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums md:text-xs">
        <p
          className={`font-semibold ${
            over ? "" : round.length ? "hidden md:block" : "hidden"
          }`}
        >
          {hits} hit
          <span className="font-normal text-white/50">
            {" "}
            / {goal.toWin} to win
          </span>
        </p>
        {!over && (
          <p className={state.tone} aria-label="Standing">
            <span className="md:hidden">{state.short}</span>
            <span className="hidden md:inline">{state.text}</span>
          </p>
        )}
      </div>
      {tip && !over && (
        <p
          className="mt-1.5 whitespace-normal rounded-md bg-amber-300/10 px-2 py-1 text-[10px] leading-snug text-amber-200 md:text-xs"
          aria-label="Tip"
        >
          <span className="font-semibold">Tip: </span>
          {tip}
        </p>
      )}

      {round.length > 0 && (
        <ol
          className="mt-2 hidden max-h-[132px] flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-t border-white/10 pt-2 text-xs md:flex"
          aria-label="Shots this game"
        >
          {round
            .map((shot, i) => ({ ...shot, number: i + 1 }))
            .reverse()
            .map((shot) => (
              <li key={shot.number} className="flex min-w-0 gap-2 tabular-nums">
                <span className="w-4 shrink-0 text-right text-white/40">
                  {shot.number}
                </span>
                <span className="w-12 shrink-0 text-white/60">
                  {shot.distanceYards} yd
                </span>
                <span
                  // A long miss is cut short with an ellipsis, never scrolled.
                  className={`min-w-0 flex-1 truncate text-left ${
                    shot.hit ? "font-semibold text-lime-300" : "text-white/80"
                  }`}
                >
                  {shot.hit ? "Hit" : `Missed: ${shot.miss}`}
                </span>
              </li>
            ))}
        </ol>
      )}

      {over &&
        (player ? (
          boardLines(board).length > 0 && (
            <div
              className="mt-2 whitespace-normal border-t border-white/10 pt-2 text-[11px] leading-snug md:text-xs"
              aria-label="Leaderboard standing"
            >
              {boardLines(board).map((line, i) => (
                <p
                  key={line}
                  className={i === 0 ? "font-semibold" : "text-lime-300"}
                >
                  {line}
                </p>
              ))}
            </div>
          )
        ) : (
          <SaveName
            source="game_card"
            hits={hits}
            targets={goal.targets}
            onSaved={onPlayer}
          />
        ))}

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

// On phones, while a game is on: one row along the foot of the picture, so
// the card does not cover it. The target that is up, the pips and Restart,
// with the last miss's tip under them when there is one. The finished game
// still gets the full card (its result, the name form, Play again).
export const GameRow = ({
  goal,
  target,
  round,
  onRestart,
  tip,
  mode,
  onDifficulty,
}) => {
  const side = target
    ? target.offlineYards === 0
      ? "centre"
      : `${Math.abs(target.offlineYards)} ${target.offlineYards > 0 ? "R" : "L"}`
    : "";
  return (
    <div
      className="hud-panel !rounded-2xl px-3 py-2"
      role="status"
      aria-label="Game"
    >
      <div className="flex h-6 items-center gap-2.5 whitespace-nowrap text-[13px]">
        <span className="font-bold tabular-nums">
          {round.length + 1}/{goal.targets}
        </span>
        {target && (
          <span className="tabular-nums">
            <span className="font-semibold">{target.distanceYards} yd</span>
            <span className="ml-1.5 text-xs text-white/60">
              {side}
              {target.air && ` · ${target.heightYards}↑`}
            </span>
          </span>
        )}
        <Pips round={round} total={goal.targets} playing />
        <span className="ml-auto" />
        {onDifficulty && (
          <DifficultyMenu mode={mode} onDifficulty={onDifficulty} />
        )}
        <button
          type="button"
          aria-label="Restart"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onRestart}
        >
          <ArrowRepeat size={14} aria-hidden="true" />
        </button>
      </div>
      {tip && (
        <p
          className="mt-1 text-[11px] leading-snug text-amber-200"
          aria-label="Tip"
        >
          <span className="font-semibold">Tip: </span>
          {tip}
        </p>
      )}
    </div>
  );
};

export default GameCard;
