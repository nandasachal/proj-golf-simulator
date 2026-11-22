// Keyboard control of the shot. The value boxes are laid out in a row (the
// strip along the bottom on laptops); the arrow keys move along it, and with Command (Ctrl on Windows) held they
// change the box that is selected:
//   ⌘ ← / →  the number, one step down or up
//   ⌘ ↑ / ↓  the word: e.g. closed ↔ square ↔ open
// Space hits the shot.

// The boxes as they are laid out in the strip, left to right.
export const GRID = [
  [
    "clubFaceAngle",
    "clubPathAngle",
    "strike",
    "aim",
    "attackAngle",
    "loftChange",
    "swingSpeed",
  ],
];
export const FIRST_CONTROL = GRID[0][0];

// Every control, and the three a normal game shows: face, path and speed are
// the lesson, the rest are refinements. Hidden controls play at their
// defaults.
export const ALL_CONTROLS = [...new Set(GRID.flat())];
const BASIC_CONTROLS = ["clubFaceAngle", "clubPathAngle", "swingSpeed"];
export const controlsFor = (mode) =>
  mode === "normal" ? BASIC_CONTROLS : ALL_CONTROLS;

const ARROWS = {
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
};

// The box an arrow key moves to from `control`, among the `visible` ones.
// Stops at the edges.
export function moveSelection(control, key, visible = ALL_CONTROLS) {
  const step = ARROWS[key];
  if (!step) return control;
  const grid = GRID.map((controls) =>
    controls.filter((name) => visible.includes(name)),
  ).filter((controls) => controls.length);
  let row = grid.findIndex((controls) => controls.includes(control));
  if (row < 0) return grid[0][0];
  let column = grid[row].indexOf(control);
  row = Math.min(grid.length - 1, Math.max(0, row + step[0]));
  column = Math.min(grid[row].length - 1, Math.max(0, column + step[1]));
  return grid[row][column];
}

// What a key press means, if anything.
//   { action: "hit" }
//   { action: "move", key }           plain arrow: select another box
//   { action: "adjust", direction }   ⌘ ←/→: the number down or up a step
//   { action: "state", direction }    ⌘ ↑/↓: the word up or down
export function keyAction(event) {
  if (event.altKey) return null;
  const command = event.metaKey || event.ctrlKey;
  if (event.key === " ") return command ? null : { action: "hit" };
  if (!ARROWS[event.key]) return null;
  if (!command) return { action: "move", key: event.key };
  if (event.key === "ArrowLeft") return { action: "adjust", direction: -1 };
  if (event.key === "ArrowRight") return { action: "adjust", direction: 1 };
  return { action: "state", direction: event.key === "ArrowUp" ? 1 : -1 };
}

// Each control reads as a word and a number. The word has three states:
// below neutral, neutral, above neutral (closed, square, open). Neutral is 0
// for everything but swing speed, where it is the club's stock speed.
export const neutralOf = (control, range) =>
  control === "swingSpeed" ? range.DEFAULT : 0;

export const stateOf = (control, value, range) =>
  Math.sign(Math.round((value - neutralOf(control, range)) * 1000));

// Step the word: from one side to neutral, from neutral one step into the
// other side. `direction` is +1 (toward open, in-to-out, toe, right, up,
// more, faster) or -1.
export function stepState(control, value, direction, range) {
  const neutral = neutralOf(control, range);
  const next = Math.min(
    1,
    Math.max(-1, stateOf(control, value, range) + direction),
  );
  if (next === stateOf(control, value, range)) return value;
  const stepped = neutral + next * range.STEP;
  return Math.min(range.MAX, Math.max(range.MIN, stepped));
}

// Keys stand down only while the user is typing into a field. Space is the
// main action, so it hits whatever else has focus (a button, a menu, a
// ruler); the app takes focus off a button first so it does not also click.
const TYPED = ["text", "number", "search", "email", "password", "tel", "url"];
export function shouldIgnoreKey(event) {
  const target = event.target;
  const tag = target && target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT" && TYPED.includes(target.type || "text")) return true;
  if (target && target.isContentEditable) return true;
  if (tag === "SELECT") return event.key !== " ";
  return false;
}
