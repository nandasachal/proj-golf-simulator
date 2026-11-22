// Web and product analytics, through PostHog. Off unless the build is given a
// project key (REACT_APP_POSTHOG_KEY, public by design), so tests and local
// runs send nothing.
import posthog from "posthog-js";
import { FIRST, hasDone, markDone } from "./first-visit";

const KEY = process.env.REACT_APP_POSTHOG_KEY;
const INTERNAL = "golf.internal";
let on = false;

// Our own devices: logging in to one of our accounts marks the browser, and
// every event from it then carries internal: true, which PostHog's "filter
// out internal and test users" rule hides. It stays marked after a log out.
export function internalDevice(storage) {
  try {
    return storage.getItem(INTERNAL) === "1";
  } catch {
    return false;
  }
}

export function markInternal(storage) {
  try {
    storage.setItem(INTERNAL, "1");
  } catch {
    // Not marked: this visit's events are still tagged below.
  }
}

// A browser's first visit lasts its first tab session, reloads included.
const FIRST_SESSION = "golf.first-session";
export function firstVisit(local, session) {
  const first = !hasDone(FIRST.visit, local) || hasDone(FIRST_SESSION, session);
  markDone(FIRST.visit, local);
  if (first) markDone(FIRST_SESSION, session);
  return first;
}

export function startAnalytics() {
  if (!KEY || process.env.NODE_ENV === "test") return;
  posthog.init(KEY, {
    api_host: process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com",
    defaults: "2025-05-24",
    // No cookie: the visitor id lives in localStorage, like the saved player.
    persistence: "localStorage",
    person_profiles: "identified_only",
    // Recording starts below, and only for a first visit.
    disable_session_recording: true,
    // Names on the leaderboard are other people's: no text is recorded.
    session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    // The swing controls are dragged and nudged constantly; only the named
    // events below are worth counting.
    autocapture: false,
    // Unhandled errors, so a broken scene shows up as $exception.
    capture_exceptions: true,
  });
  posthog.register({
    app_version: process.env.REACT_APP_VERSION || "dev",
    player_saved: false,
  });
  if (internalDevice(window.localStorage)) posthog.register({ internal: true });
  const first = firstVisit(window.localStorage, window.sessionStorage);
  posthog.register({ first_visit: first });
  // Replays only of first visits, to see where new players get stuck. Inputs
  // and text are masked.
  if (first) posthog.startSessionRecording();
  on = true;
}

export const track = (event, properties) => {
  if (on) posthog.capture(event, properties);
};

// A failure, once per kind per page load: an outage would otherwise send one
// for every shot.
const reported = new Set();
export const reportError = (kind, detail) => {
  if (reported.has(kind)) return;
  reported.add(kind);
  track("app_error", { kind, detail });
};

// Properties every later event carries (viewport, player_saved).
export const setContext = (properties) => {
  if (on) posthog.register(properties);
};

// Ties this browser's events to the saved player. The id only: the name is
// already public on the leaderboard and PostHog does not need it.
export const identify = (player) => {
  if (!player) return;
  if (player.internal) markInternal(window.localStorage);
  if (!on) return;
  if (player.internal) posthog.register({ internal: true });
  posthog.identify(player.id);
  posthog.register({ player_saved: true });
};
