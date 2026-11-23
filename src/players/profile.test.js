import {
  clearProfile,
  googleInitials,
  initialsOf,
  loadProfile,
  saveProfile,
} from "./profile";

beforeEach(() => window.localStorage.clear());
afterEach(() => jest.restoreAllMocks());

test("there is no player until one is saved", () => {
  expect(loadProfile()).toBeNull();
});

test("a saved player comes back with id, name, key and account, and nothing else", () => {
  saveProfile({ id: "p1", name: "Sachal", key: "secret", internal: true });
  expect(loadProfile()).toEqual({
    id: "p1",
    name: "Sachal",
    key: "secret",
    account: false,
  });
});

test("logging out forgets the player", () => {
  saveProfile({ id: "p1", name: "Sachal", key: "secret", account: true });
  clearProfile();
  expect(loadProfile()).toBeNull();
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

describe("the initials in the player's circle", () => {
  const credential = (claims) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

  test("a Google sign-in gives the first and last name's initials", () => {
    expect(
      googleInitials(
        credential({ given_name: "sachal", family_name: "Nanda" }),
      ),
    ).toBe("SN");
    expect(
      googleInitials(credential({ given_name: "Émile", family_name: "Zola" })),
    ).toBe("ÉZ");
    expect(googleInitials(credential({ given_name: "Cher" }))).toBe("C");
    expect(googleInitials(credential({}))).toBeUndefined();
    expect(googleInitials("not a credential")).toBeUndefined();
  });

  test("they are kept with the saved player and used for the circle", () => {
    saveProfile({ id: "p1", name: "snas9492", key: "secret", initials: "SN" });
    expect(initialsOf(loadProfile())).toBe("SN");
  });

  test("with no real name they come from the leaderboard name", () => {
    expect(initialsOf({ name: "snas9492" })).toBe("SN");
    expect(initialsOf({ name: "Sachal Nanda" })).toBe("SN");
    expect(initialsOf({ name: "big_hitter.99" })).toBe("B9");
    expect(initialsOf({ name: "x" })).toBe("X");
  });
});
