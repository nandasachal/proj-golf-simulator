import React, { useEffect, useRef, useState } from "react";
import { reportError, track } from "../../analytics";
import { saveFailReason } from "../../analytics-events";
import {
  addPassword,
  createPlayer,
  googlePlayer,
  loginPlayer,
} from "../../players/api";
import { googleClientId, loadGoogle } from "../../players/google";
import { saveProfile } from "../../players/profile";

const ERRORS = {
  name_taken: "That name is taken. Try another, or log in if it's yours.",
  invalid_name: "Use 2 to 16 characters, and keep it clean.",
  invalid_password: "Use a password of at least 8 characters.",
  wrong_login: "That name and password don't match.",
  google_failed: "Google sign-in didn't work. Try again.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  unavailable: "Couldn't reach the leaderboard. Try again.",
};

const INPUT =
  "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none placeholder:font-normal placeholder:text-white/40 focus:bg-white focus:text-slate-900 md:text-sm";
const SUBMIT =
  "shrink-0 rounded-md bg-lime-400 px-2.5 py-1 text-xs font-bold text-slate-900 hover:bg-lime-300 disabled:opacity-60";
const LINK =
  "text-left text-[10px] text-white/50 underline-offset-2 hover:text-white hover:underline md:text-[11px]";

// The three ways on to the leaderboard, or not: a name alone, which belongs
// to this browser; an account, whose name comes back on any device once
// logged in; or neither.
const WAYS = {
  name: { tab: "Name only", submit: "Save" },
  create: { tab: "Account", submit: "Create account" },
  login: { tab: "Account", submit: "Log in" },
};

const Password = ({ value, onChange, fresh }) => (
  <input
    type="password"
    aria-label="Password"
    placeholder={fresh ? "Password, 8 or more characters" : "Password"}
    autoComplete={fresh ? "new-password" : "current-password"}
    minLength={fresh ? 8 : undefined}
    maxLength={128}
    required
    className={INPUT}
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);

// Google's own button, when the build has a client id. onCredential gets the
// credential Google signs for whoever picked their account.
const GoogleButton = ({ onCredential }) => {
  const holder = useRef(null);
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    if (!googleClientId()) return undefined;
    let gone = false;
    loadGoogle()
      .then((id) => {
        if (gone || !holder.current) return;
        id.initialize({
          client_id: googleClientId(),
          callback: ({ credential }) => latest.current(credential),
        });
        id.renderButton(holder.current, {
          theme: "filled_black",
          size: "medium",
          shape: "pill",
          text: "continue_with",
        });
      })
      .catch(() => reportError("google_unreachable"));
    return () => {
      gone = true;
    };
  }, []);

  if (!googleClientId()) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={holder} data-testid="google-button" />
      <p className="text-[10px] text-white/40 md:text-[11px]">
        or with a name and password
      </p>
    </div>
  );
};

// With no name saved. It is on the game card after a game, which gives its
// score, and in the leaderboard, which gives its own `prompt`. onSaved gets
// the player.
const SaveName = ({ hits, targets, prompt, source, onSaved }) => {
  const [way, setWay] = useState("name");
  const [skipped, setSkipped] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  // A Google credential waiting for its leaderboard name.
  const [google, setGoogle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    track("save_name_shown", { source });
  }, [source]);

  if (skipped) return null;

  const choose = (next) => {
    setWay(next);
    setError(null);
  };

  const failed = (reason) => {
    track("name_save_failed", { source, reason: saveFailReason(reason) });
    setBusy(false);
    setError(ERRORS[reason] || ERRORS.unavailable);
  };

  const withGoogle = async (credential, chosen) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const answer = await googlePlayer(credential, chosen);
    if (answer.error === "name_needed") {
      // First time for this Google account: it picks a leaderboard name.
      setGoogle(credential);
      setBusy(false);
      return;
    }
    if (answer.error === "wrong_login") {
      setGoogle(null);
      failed("google_failed");
      return;
    }
    if (answer.error) {
      failed(answer.error);
      return;
    }
    saveProfile(answer.player);
    if (answer.created)
      track("name_saved", { source, account: true, method: "google" });
    else track("player_logged_in", { source, method: "google" });
    onSaved(answer.player);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (google) {
      withGoogle(google, name.trim());
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    const answer = await (way === "login"
      ? loginPlayer(name.trim(), password)
      : createPlayer(name.trim(), way === "create" ? password : undefined));
    if (answer.error) {
      failed(answer.error);
      return;
    }
    saveProfile(answer.player);
    if (way === "login") track("player_logged_in", { source });
    else track("name_saved", { source, account: way === "create" });
    onSaved(answer.player);
  };

  const account = way !== "name";

  if (google)
    return (
      <form
        className="mt-2 whitespace-normal border-t border-white/10 pt-2"
        aria-label="Save to the leaderboard"
        onSubmit={submit}
      >
        <p className="text-[11px] font-semibold leading-snug md:text-sm">
          Signed in with Google. Pick your leaderboard name.
        </p>
        <div className="mt-1.5 flex gap-1.5">
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
          <button type="submit" disabled={busy} className={SUBMIT}>
            Save
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-[11px] text-rose-300 md:text-xs">
            {error}
          </p>
        )}
      </form>
    );

  return (
    <form
      className="mt-2 whitespace-normal border-t border-white/10 pt-2"
      aria-label="Save to the leaderboard"
      onSubmit={submit}
    >
      <p className="text-[11px] font-semibold leading-snug md:text-sm">
        {prompt || `${hits} of ${targets}. Save it to the leaderboard?`}
      </p>
      <div
        className="mt-1.5 grid grid-cols-2 gap-0.5 rounded-md bg-white/10 p-0.5 text-[11px] md:text-xs"
        role="group"
        aria-label="How to save"
      >
        {[
          ["name", !account],
          ["create", account],
        ].map(([id, chosen]) => (
          <button
            key={id}
            type="button"
            aria-pressed={chosen}
            className={`rounded px-1 py-0.5 font-semibold ${
              chosen
                ? "bg-white/20 text-white"
                : "text-white/60 hover:text-white"
            }`}
            onClick={() => !chosen && choose(id)}
          >
            {WAYS[id].tab}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/50 md:text-[11px]">
        {account
          ? "Your name and scores, on any device you log in on."
          : "No password. The name stays on this device."}
      </p>
      <div
        className={`mt-1.5 flex flex-col gap-1.5 ${account ? "" : "md:flex-row"}`}
      >
        {account && <GoogleButton onCredential={withGoogle} />}
        <input
          type="text"
          aria-label="Name"
          placeholder="Your name"
          autoComplete={account ? "username" : "nickname"}
          minLength={2}
          maxLength={16}
          required
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {account && (
          <Password
            value={password}
            onChange={setPassword}
            fresh={way === "create"}
          />
        )}
        <button type="submit" disabled={busy} className={SUBMIT}>
          {WAYS[way].submit}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-rose-300 md:text-xs">
          {error}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {account ? (
          <button
            type="button"
            className={LINK}
            onClick={() => choose(way === "login" ? "create" : "login")}
          >
            {way === "login"
              ? "New here? Create an account"
              : "Have an account? Log in"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={LINK}
          onClick={() => {
            track("save_name_skipped", { source });
            setSkipped(true);
          }}
        >
          Not now
        </button>
      </div>
      <a
        className={`${LINK} mt-1 block`}
        href="/privacy.html"
        target="_blank"
        rel="noreferrer"
      >
        What is stored: privacy
      </a>
    </form>
  );
};

// For a name saved without a password: adding one makes it an account.
export const AddPassword = ({ player, onSaved }) => {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const answer = await addPassword(player.key, password);
    setBusy(false);
    if (answer.error) {
      setError(
        answer.error === "wrong_login"
          ? ERRORS.unavailable
          : ERRORS[answer.error] || ERRORS.unavailable,
      );
      return;
    }
    saveProfile(answer.player);
    track("account_created", { source: "leaderboard" });
    onSaved(answer.player);
  };

  // Ties the saved name to a Google account instead of a password.
  const withGoogle = async (credential) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const answer = await googlePlayer(credential, undefined, player.key);
    setBusy(false);
    if (answer.error || answer.player.id !== player.id) {
      // That Google account already has a name of its own, or did not check out.
      setError(ERRORS.google_failed);
      return;
    }
    saveProfile(answer.player);
    track("account_created", { source: "leaderboard", method: "google" });
    onSaved(answer.player);
  };

  return (
    <form aria-label="Create an account" onSubmit={submit}>
      <p className="text-xs leading-snug text-white/70">
        Saved as {player.name} on this device. Make it an account to use the
        name on any device.
      </p>
      <div className="mt-1.5">
        <GoogleButton onCredential={withGoogle} />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Password value={password} onChange={setPassword} fresh />
        <button type="submit" disabled={busy} className={SUBMIT}>
          Create account
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
};

export default SaveName;
