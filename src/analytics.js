// Web and product analytics, through PostHog. Off unless the build is given a
// project key (REACT_APP_POSTHOG_KEY, public by design), so tests and local
// runs send nothing.
import posthog from "posthog-js";

const KEY = process.env.REACT_APP_POSTHOG_KEY;
const INTERNAL = "golf.internal";
let on = false;

// Our own devices: opening the site once with ?internal=1 marks this browser,
// and every event from it then carries internal: true, which PostHog's
// "filter out internal and test users" rule hides. ?internal=0 unmarks it.
export function internalDevice(search, storage) {
  try {
    const asked = new URLSearchParams(search).get("internal");
    if (asked === "1") storage.setItem(INTERNAL, "1");
    if (asked === "0") storage.removeItem(INTERNAL);
    return storage.getItem(INTERNAL) === "1";
  } catch {
    return false;
  }
}

export function startAnalytics() {
  if (!KEY || process.env.NODE_ENV === "test") return;
  posthog.init(KEY, {
    api_host: process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com",
    defaults: "2025-05-24",
    // No cookie: the visitor id lives in localStorage, like the saved player.
    persistence: "localStorage",
    person_profiles: "identified_only",
    disable_session_recording: true,
    // The swing controls are dragged and nudged constantly; only the named
    // events below are worth counting.
    autocapture: false,
  });
  if (internalDevice(window.location.search, window.localStorage))
    posthog.register({ internal: true });
  on = true;
}

export const track = (event, properties) => {
  if (on) posthog.capture(event, properties);
};

// Ties this browser's events to the saved player.
export const identify = (player) => {
  if (on && player) posthog.identify(player.id, { name: player.name });
};
