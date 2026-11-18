import { loadProfile, saveProfile } from "./profile";

beforeEach(() => window.localStorage.clear());
afterEach(() => jest.restoreAllMocks());

test("there is no player until one is saved", () => {
  expect(loadProfile()).toBeNull();
});

test("a saved player comes back with id, name and key, and nothing else", () => {
  saveProfile({ id: "p1", name: "Sachal", key: "secret", recoveryCode: "X" });
  expect(loadProfile()).toEqual({ id: "p1", name: "Sachal", key: "secret" });
});

test("junk in storage is no player", () => {
  window.localStorage.setItem("golf.player", "{not json");
  expect(loadProfile()).toBeNull();
  window.localStorage.setItem("golf.player", JSON.stringify({ name: "x" }));
  expect(loadProfile()).toBeNull();
});

test("storage that throws is treated as no player, without an error", () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  expect(() => saveProfile({ id: "p1", name: "S", key: "k" })).not.toThrow();
  expect(loadProfile()).toBeNull();
});
