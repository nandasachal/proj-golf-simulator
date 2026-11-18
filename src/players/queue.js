// Scored game shots waiting to be sent to the API, oldest first, kept in
// localStorage so they survive a reload and an API outage.
import { postShot } from "./api";
import { loadProfile } from "./profile";

const STORAGE_KEY = "golf.shots";
// Answers that will never change on a retry: a bad key, a full game, a shot
// the API will not accept.
const REJECTED = [401, 409, 422];

const read = () => {
  try {
    const shots = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(shots) ? shots : [];
  } catch {
    return [];
  }
};

const write = (shots) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shots));
  } catch {
    // Storage is unavailable: these shots are not recorded.
  }
};

export const queuedShots = read;

// crypto.randomUUID needs a recent browser and a secure page.
export const newGameId = () =>
  window.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ ((Math.random() * 16) >> (c / 4))).toString(16),
  );

async function send() {
  for (;;) {
    const profile = loadProfile();
    const [shot] = read();
    if (!profile || !shot) return;
    const status = await postShot(profile.key, shot);
    const sent = status >= 200 && status < 300;
    if (!sent && !REJECTED.includes(status)) return;
    write(read().slice(1));
  }
}

let sending = Promise.resolve();

// Sends what is queued, one shot at a time, stopping at the first the API
// cannot take right now. Never rejects.
export function flush() {
  sending = sending.then(send).catch(() => {});
  return sending;
}

// shot: { gameId, mode, club, targetYards, hit }
export function recordShot(shot) {
  if (shot.mode === "practice") return;
  // Until a name is saved only the game being played is held, so saving one
  // after a game sends that game and not every game before it.
  const held = loadProfile()
    ? read()
    : read().filter((queued) => queued.gameId === shot.gameId);
  write([...held, shot]);
  flush();
}
