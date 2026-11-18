import { flush, newGameId, queuedShots, recordShot } from "./queue";
import { saveProfile } from "./profile";

const PLAYER = { id: "p1", name: "Sachal", key: "secret" };
const shot = (gameId, targetYards, hit = true) => ({
  gameId,
  mode: "normal",
  club: "driver",
  targetYards,
  hit,
});
const answer = (status) => Promise.resolve({ ok: status < 400, status });
// What was posted to /shots, in order.
const posted = () =>
  global.fetch.mock.calls
    .filter(([url]) => url.endsWith("/shots"))
    .map(([, options]) => JSON.parse(options.body));

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => answer(201));
});

test("without a player, shots of the game being played are held and nothing is sent", async () => {
  recordShot(shot("g1", 200));
  recordShot(shot("g1", 250, false));
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(queuedShots()).toEqual([shot("g1", 200), shot("g1", 250, false)]);
});

test("without a player, a new game replaces the one held before it", () => {
  recordShot(shot("g1", 200));
  recordShot(shot("g2", 180));
  expect(queuedShots()).toEqual([shot("g2", 180)]);
});

test("saving a name sends the held shots in order, with the player's key", async () => {
  recordShot(shot("g1", 200));
  recordShot(shot("g1", 250, false));
  saveProfile(PLAYER);
  await flush();

  expect(posted()).toEqual([shot("g1", 200), shot("g1", 250, false)]);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe("http://localhost:8000/shots");
  expect(options.method).toBe("POST");
  expect(options.headers.Authorization).toBe("Bearer secret");
  expect(queuedShots()).toEqual([]);
});

test("with a player, a shot is sent as it is recorded and earlier games are kept", async () => {
  saveProfile(PLAYER);
  global.fetch.mockImplementation(() => Promise.reject(new TypeError("down")));
  recordShot(shot("g1", 200));
  await flush();
  recordShot(shot("g2", 180));
  await flush();
  expect(queuedShots()).toEqual([shot("g1", 200), shot("g2", 180)]);

  // back up: the next shot takes the waiting ones with it
  global.fetch.mockImplementation(() => answer(201));
  recordShot(shot("g2", 220));
  await flush();
  expect(posted().slice(-3)).toEqual([
    shot("g1", 200),
    shot("g2", 180),
    shot("g2", 220),
  ]);
  expect(queuedShots()).toEqual([]);
});

test.each([429, 500, 503])(
  "a %i answer keeps the shot for later and does not send the ones behind it",
  async (status) => {
    saveProfile(PLAYER);
    global.fetch.mockImplementation(() => answer(status));
    recordShot(shot("g1", 200));
    recordShot(shot("g1", 250));
    await flush();
    expect(queuedShots()).toEqual([shot("g1", 200), shot("g1", 250)]);
    // every attempt was the oldest shot again
    expect(new Set(posted().map((sent) => sent.targetYards))).toEqual(
      new Set([200]),
    );
  },
);

test.each([401, 409, 422])(
  "a %i answer drops that shot and carries on with the next",
  async (status) => {
    saveProfile(PLAYER);
    global.fetch
      .mockImplementationOnce(() => answer(status))
      .mockImplementation(() => answer(201));
    recordShot(shot("g1", 200));
    recordShot(shot("g1", 250));
    await flush();
    expect(posted()).toEqual([shot("g1", 200), shot("g1", 250)]);
    expect(queuedShots()).toEqual([]);
  },
);

test("practice shots are never recorded or sent", async () => {
  saveProfile(PLAYER);
  recordShot({ ...shot("g1", 200), mode: "practice" });
  await flush();
  expect(queuedShots()).toEqual([]);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("storage that throws loses the shot but not the game", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  expect(() => recordShot(shot("g1", 200))).not.toThrow();
  await expect(flush()).resolves.toBeUndefined();
  jest.restoreAllMocks();
});

test("each game id is a different UUID", () => {
  const a = newGameId();
  expect(a).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(newGameId()).not.toBe(a);
});
