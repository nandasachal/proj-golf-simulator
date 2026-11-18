// Web and product analytics, through PostHog. Off unless the build is given a
// project key (REACT_APP_POSTHOG_KEY, public by design), so tests and local
// runs send nothing.
import posthog from "posthog-js";

const KEY = process.env.REACT_APP_POSTHOG_KEY;
let on = false;

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
  on = true;
}

export const track = (event, properties) => {
  if (on) posthog.capture(event, properties);
};

// Ties this browser's events to the saved player.
export const identify = (player) => {
  if (on && player) posthog.identify(player.id, { name: player.name });
};
