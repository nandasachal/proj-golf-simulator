// Keyboard control of the shot. The value boxes are laid out in a grid; the
// arrow keys move between them, and with Command (Ctrl on Windows) held they
// change the box that is selected:
//   ⌘ ← / →  the number, one step down or up
//   ⌘ ↑ / ↓  the word: e.g. closed ↔ square ↔ open
// Space hits the shot.

// The boxes as they are laid out in the panel. Swing speed spans its row.
export const GRID = [
  ["clubFaceAngle", "clubPathAngle"],
  ["strike", "aim"],
  ["attackAngle", "loftChange"],
  ["swingSpeed", "swingSpeed"],
];
export const FIRST_CONTROL = GRID[0][0];

const ARROWS = {
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
};

// The box an arrow key moves to from `control`. Stops at the edges.
export function moveSelection(control, key) {
  const step = ARROWS[key];
  if (!step) return control;
  let row = GRID.findIndex((controls) => controls.includes(control));
  if (row < 0) return FIRST_CONTROL;
  let column = GRID[row].indexOf(control);
  row = Math.min(GRID.length - 1, Math.max(0, row + step[0]));
  column = Math.min(GRID[row].length - 1, Math.max(0, column + step[1]));
  return GRID[row][column];
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

// Keys stand down while the user is typing somewhere, or pressing Space on a
// button (which already clicks it).
export function shouldIgnoreKey(event) {
  const target = event.target;
  const tag = target && target.tagName;
  if (tag === "SELECT" || tag === "TEXTAREA") return true;
  if (tag === "INPUT" && target.type !== "range") return true;
  if (target && target.isContentEditable) return true;
  if (event.key === " " && (tag === "BUTTON" || tag === "A")) return true;
  return false;
}
