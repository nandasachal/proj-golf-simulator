import React, { useState } from "react";
import { createPlayer, recoverPlayer } from "../../players/api";
import { saveProfile } from "../../players/profile";

const ERRORS = {
  name_taken: "That name is taken. Try another.",
  invalid_name: "Use 2 to 16 characters, and keep it clean.",
  wrong_code: "That name and code don't match.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  unavailable: "Couldn't reach the leaderboard. Try again.",
};

const INPUT =
  "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none placeholder:font-normal placeholder:text-white/40 focus:bg-white focus:text-slate-900 md:text-sm";

// The end of a game with no name saved: one field to put the score on the
// leaderboard, or a name and recovery code to carry on as an existing player.
// onSaved gets the player and, for a new name, its recovery code.
const SaveName = ({ hits, targets, onSaved }) => {
  const [recovering, setRecovering] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const answer = await (recovering
      ? recoverPlayer(name.trim(), code.trim())
      : createPlayer(name.trim()));
    if (answer.error) {
      setBusy(false);
      setError(ERRORS[answer.error] || ERRORS.unavailable);
      return;
    }
    saveProfile(answer.player);
    onSaved(answer.player, answer.recoveryCode);
  };

  return (
    <form
      className="mt-2 whitespace-normal border-t border-white/10 pt-2"
      aria-label="Save to the leaderboard"
      onSubmit={submit}
    >
      <p className="text-[11px] font-semibold leading-snug md:text-sm">
        {recovering
          ? "Use your name on this device"
          : `${hits} of ${targets}. Save it to the leaderboard?`}
      </p>
      <div
        className={`mt-1.5 flex flex-col gap-1.5 ${recovering ? "" : "md:flex-row"}`}
      >
        <input
          type="text"
          aria-label="Name"
          placeholder="Your name"
          autoComplete="nickname"
          minLength={2}
          maxLength={16}
          required
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {recovering && (
          <input
            type="text"
            aria-label="Recovery code"
            placeholder="Recovery code"
            autoComplete="off"
            autoCapitalize="characters"
            required
            className={INPUT}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-md bg-lime-400 px-2.5 py-1 text-xs font-bold text-slate-900 hover:bg-lime-300 disabled:opacity-60"
        >
          {recovering ? "Use name" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-rose-300 md:text-xs">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-1.5 text-left text-[10px] text-white/50 underline-offset-2 hover:text-white hover:underline md:text-[11px]"
        onClick={() => {
          setRecovering(!recovering);
          setError(null);
        }}
      >
        {recovering
          ? "New here? Save a new name"
          : "Already have a name? Use recovery code"}
      </button>
    </form>
  );
};

export default SaveName;
