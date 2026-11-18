import { internalDevice } from "./analytics";

const storage = () => {
  const kept = {};
  return {
    getItem: (key) => kept[key] ?? null,
    setItem: (key, value) => (kept[key] = value),
    removeItem: (key) => delete kept[key],
  };
};

test("?internal=1 marks the browser and it stays marked on later visits", () => {
  const browser = storage();
  expect(internalDevice("", browser)).toBe(false);
  expect(internalDevice("?mode=practice&internal=1", browser)).toBe(true);
  expect(internalDevice("", browser)).toBe(true);
});

test("?internal=0 unmarks it", () => {
  const browser = storage();
  internalDevice("?internal=1", browser);
  expect(internalDevice("?internal=0", browser)).toBe(false);
  expect(internalDevice("", browser)).toBe(false);
});

test("a browser with no storage is not internal", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  expect(internalDevice("", broken)).toBe(false);
});
