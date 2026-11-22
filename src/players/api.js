import { reportError } from "../analytics";

const BASE =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://golf-leaderboard-api.onrender.com"
    : "http://localhost:8000");

// A hung API must not hold the shot queue or a Save button for ever.
const timeout = () => window.AbortSignal?.timeout?.(10000);

const post = (path, body, key) =>
  fetch(`${BASE}${path}`, {
    signal: timeout(),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key && { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(body),
  });

// These resolve to { player: { id, name, key, account, internal }, created }
// or { error }, where error is the API's own code, "wrong_login",
// "rate_limited" or "unavailable". `created` says the player is new.
async function playerRequest(path, body, key) {
  try {
    const response = await post(path, body, key);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const { id, name, key: saved, account, internal } = data;
      return {
        player: {
          id,
          name,
          key: saved,
          account: !!account,
          internal: !!internal,
        },
        created: response.status === 201,
      };
    }
    if (response.status === 401) return { error: "wrong_login" };
    if (response.status === 429) return { error: "rate_limited" };
    if (response.status === 409 || response.status === 422)
      return { error: data.error || "invalid_name" };
    return { error: "unavailable" };
  } catch {
    reportError("api_unreachable", path);
    return { error: "unavailable" };
  }
}

// With a password the name is an account; without one it is this browser's.
export const createPlayer = (name, password) =>
  playerRequest("/players", { name, ...(password && { password }) });

export const loginPlayer = (name, password) =>
  playerRequest("/players/login", { name, password });

// Sign in with Google: logs in a Google account seen before, ties it to the
// name this browser holds (`key`), or makes a new player called `name`.
// Answers "name_needed" when it is new and no name was given.
export const googlePlayer = (credential, name, key) =>
  playerRequest("/players/google", { credential, ...(name && { name }) }, key);

// Makes an account of the name this browser already holds.
export const addPassword = (key, password) =>
  playerRequest("/players/password", { password }, key);

// The HTTP status, or 0 when the API could not be reached.
export async function postShot(key, shot) {
  try {
    return (await post("/shots", shot, key)).status;
  } catch {
    reportError("api_unreachable", "/shots");
    return 0;
  }
}

// Rejects when the API is down or answers with an error.
export async function getLeaderboard({ mode, period, player }) {
  const query = new URLSearchParams({ mode, period });
  if (player) query.set("player", player);
  const response = await fetch(`${BASE}/leaderboard?${query}`, {
    signal: timeout(),
  }).catch((error) => {
    reportError("api_unreachable", "/leaderboard");
    throw error;
  });
  if (!response.ok) throw new Error(`leaderboard ${response.status}`);
  return response.json();
}
