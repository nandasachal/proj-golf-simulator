import React, { useEffect, useState } from "react";
import { track } from "../../analytics";
import { Dialog } from "@headlessui/react";
import SaveName from "./save-name";
import { Trophy, X } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import { Segmented } from "./settings-modal";
import { getLeaderboard } from "../../players/api";

const CELL = "px-1 py-1.5 text-right tabular-nums";

const Row = ({ row, mine }) => (
  <tr
    className={classNames(
      "border-t border-white/5",
      mine && "bg-lime-400/15 font-semibold text-lime-200",
    )}
    aria-current={mine ? "true" : undefined}
  >
    <td className="w-8 py-1.5 pl-1.5 tabular-nums text-white/60">{row.rank}</td>
    <td className="truncate px-1 py-1.5">
      {row.name}
      {mine && <span className="sr-only"> (you)</span>}
    </td>
    <td className={CELL}>{Math.round(row.pct)}%</td>
    <td className={CELL}>{row.games}</td>
    <td className={`${CELL} pr-1.5`}>{row.bestStreak}</td>
  </tr>
);

const Board = ({ board, playerId }) => {
  const { rows, warmingUp, me, minAttempts } = board;
  // Outside the top rows the player is shown under them, between the two
  // players either side.
  const around =
    me?.ranked && !rows.some((row) => row.id === me.id)
      ? [
          me,
          ...(me.neighbours || []).filter(
            (row) => row.id !== me.id && !rows.some((top) => top.id === row.id),
          ),
        ].sort((a, b) => a.rank - b.rank)
      : [];
  const warming =
    me &&
    !me.ranked &&
    me.attempts > 0 &&
    !warmingUp.some((p) => p.id === me.id)
      ? [...warmingUp, me]
      : warmingUp;

  if (rows.length === 0 && warming.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-white/60">
        No one has played yet
      </p>
    );
  }

  return (
    <>
      {rows.length > 0 ? (
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-white/45">
              <th scope="col" className="w-8 py-1 pl-1.5 font-semibold">
                <span aria-hidden="true">#</span>
                <span className="sr-only">Rank</span>
              </th>
              <th scope="col" className="px-1 py-1 font-semibold">
                Name
              </th>
              <th
                scope="col"
                className="w-14 px-1 py-1 text-right font-semibold"
              >
                Hit %
              </th>
              <th
                scope="col"
                className="w-14 px-1 py-1 text-right font-semibold"
              >
                Games
              </th>
              <th
                scope="col"
                className="w-14 py-1 pl-1 pr-1.5 text-right font-semibold"
              >
                <span className="sr-only">Best </span>Streak
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.id} row={row} mine={row.id === playerId} />
            ))}
            {around.length > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={5}
                  className="border-t border-dashed border-white/30 py-0.5 text-center text-xs leading-none text-white/40"
                >
                  ⋯
                </td>
              </tr>
            )}
            {around.map((row) => (
              <Row key={row.id} row={row} mine={row.id === playerId} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-3 text-center text-sm text-white/60">
          No one is ranked yet.
        </p>
      )}

      {warming.length > 0 && (
        <section className="mt-4" aria-label="Warming up">
          <h3 className="text-sm font-bold">Warming up</h3>
          <p className="mt-0.5 text-xs text-white/50">
            Ranked after {minAttempts} targets.
          </p>
          <ul className="mt-1.5 text-sm">
            {warming.map((entry) => (
              <li
                key={entry.id}
                className={classNames(
                  "flex items-baseline gap-2 border-t border-white/5 px-1.5 py-1.5",
                  entry.id === playerId &&
                    "bg-lime-400/15 font-semibold text-lime-200",
                )}
                aria-current={entry.id === playerId ? "true" : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-white/60">
                  {entry.hits} of {entry.attempts} hit ·{" "}
                  {minAttempts - entry.attempts} to go
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

// The leaderboard, behind the trophy button: one board per game mode, for
// this week or all time, with the saved player's own row always in view.
const LeaderboardModal = ({ player, startMode, onPlayer }) => {
  const [open, setOpen] = useState(false);
  // Shown once, straight after a name is saved here.
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [mode, setMode] = useState(startMode);
  const [period, setPeriod] = useState("all");
  // { key, board } or { key, failed } for the latest answer; the key says
  // which mode and period it is for.
  const [answer, setAnswer] = useState(null);
  const key = `${mode}/${period}`;
  const playerId = player?.id;

  useEffect(() => {
    if (!open) return undefined;
    let stale = false;
    getLeaderboard({ mode, period, player: playerId })
      .then((board) => !stale && setAnswer({ key, board }))
      .catch(() => !stale && setAnswer({ key, failed: true }));
    return () => {
      stale = true;
    };
  }, [open, mode, period, playerId, key]);

  const current = answer?.key === key ? answer : null;

  return (
    <>
      <button
        type="button"
        aria-label="Leaderboard"
        aria-haspopup="dialog"
        className="hud-panel flex h-10 w-10 items-center justify-center !rounded-full text-white/90 transition-colors hover:text-white"
        onClick={() => {
          setMode(startMode);
          setAnswer(null);
          setRecoveryCode(null);
          setOpen(true);
          track("leaderboard_opened", { mode: startMode });
        }}
      >
        <Trophy size={18} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Panel className="hud-panel hud-panel-solid max-h-full w-full max-w-sm overflow-y-auto p-5 text-white">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-bold">
                Leaderboard
              </Dialog.Title>
              <button
                type="button"
                aria-label="Close leaderboard"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <p className="mt-0.5 text-xs text-white/50">
              Ranked by share of targets hit, every game counted.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <Segmented
                label="Game mode"
                accent
                options={[
                  ["normal", "Normal"],
                  ["advanced", "Advanced"],
                ]}
                value={mode}
                onChange={setMode}
              />
              <Segmented
                label="Period"
                options={[
                  ["week", "This week"],
                  ["all", "All time"],
                ]}
                value={period}
                onChange={setPeriod}
              />
            </div>

            <div className="mt-3 min-h-[8rem]" aria-live="polite">
              {!current ? (
                <p className="py-8 text-center text-sm text-white/60">
                  Loading…
                </p>
              ) : current.failed ? (
                <p className="py-8 text-center text-sm text-white/60">
                  Leaderboard is unavailable right now
                </p>
              ) : (
                <Board board={current.board} playerId={playerId} />
              )}
            </div>

            {recoveryCode ? (
              <div className="mt-2 border-t border-white/10 pt-2">
                <p className="text-xs text-white/70">
                  Saved as {player?.name}. Your recovery code:
                </p>
                <p className="mt-1 select-all font-mono text-base font-bold tracking-wider text-amber-300">
                  {recoveryCode}
                </p>
                <p className="mt-1 text-xs leading-snug text-white/70">
                  Write this down to use your name on another device. It is only
                  shown once.
                </p>
              </div>
            ) : player ? null : (
              <SaveName
                prompt="Save a name to get on the board"
                onSaved={(saved, code) => {
                  setRecoveryCode(code || null);
                  onPlayer(saved);
                }}
              />
            )}
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
};

export default LeaderboardModal;
