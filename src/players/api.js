const BASE =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.golfswingsimulator.com"
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

// Both resolve to { player: { id, name, key }, recoveryCode } or { error },
// where error is the API's own code, "wrong_code", "rate_limited" or "unavailable".
async function playerRequest(path, body) {
  try {
    const response = await post(path, body);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const { id, name, key, recoveryCode } = data;
      return { player: { id, name, key }, recoveryCode };
    }
    if (response.status === 401) return { error: "wrong_code" };
    if (response.status === 429) return { error: "rate_limited" };
    if (response.status === 409 || response.status === 422)
      return { error: data.error || "invalid_name" };
    return { error: "unavailable" };
  } catch {
    return { error: "unavailable" };
  }
}

export const createPlayer = (name) => playerRequest("/players", { name });

export const recoverPlayer = (name, recoveryCode) =>
  playerRequest("/players/recover", { name, recoveryCode });

// The HTTP status, or 0 when the API could not be reached.
export async function postShot(key, shot) {
  try {
    return (await post("/shots", shot, key)).status;
  } catch {
    return 0;
  }
}

// Rejects when the API is down or answers with an error.
export async function getLeaderboard({ mode, period, player }) {
  const query = new URLSearchParams({ mode, period });
  if (player) query.set("player", player);
  const response = await fetch(`${BASE}/leaderboard?${query}`, {
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`leaderboard ${response.status}`);
  return response.json();
}
