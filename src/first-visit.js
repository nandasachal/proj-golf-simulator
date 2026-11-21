// What this browser has done before, for the first-visit help: the Hit prompt
// until a first shot, an easy first target until a first scored shot. Stored
// in localStorage; if that is blocked every visit counts as a first one.
export const FIRST = {
  visit: "golf.visited",
  shot: "golf.shot",
  target: "golf.target",
};

export const hasDone = (key, storage = window.localStorage) => {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export const markDone = (key, storage = window.localStorage) => {
  try {
    storage.setItem(key, "1");
  } catch {}
};
