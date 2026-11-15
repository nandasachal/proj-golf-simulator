// Keyboard shortcuts for the shot controls. Letters, not arrow keys, so they
// never fight a focused slider's own arrow-key handling.
export const SHORTCUTS = {
  clubFaceAngle: { down: "q", up: "e" },
  clubPathAngle: { down: "a", up: "d" },
  swingSpeed: { down: "s", up: "w" },
  aim: { down: "z", up: "c" },
  attackAngle: { down: "g", up: "t" },
  loftChange: { down: "h", up: "y" },
  strike: { down: "b", up: "n" },
  hit: " ",
  reset: "r",
};

export const ADJUSTABLE = [
  "clubFaceAngle",
  "clubPathAngle",
  "swingSpeed",
  "aim",
  "attackAngle",
  "loftChange",
  "strike",
];

export const keyLabel = (key) => (key === " " ? "Space" : key.toUpperCase());

// Which control and direction a key press means, if any.
export function shortcutFor(key) {
  const pressed = key.length === 1 ? key.toLowerCase() : key;
  if (pressed === SHORTCUTS.hit) return { action: "hit" };
  if (pressed === SHORTCUTS.reset) return { action: "reset" };
  for (const control of ADJUSTABLE) {
    if (pressed === SHORTCUTS[control].down) {
      return { action: "adjust", control, direction: -1 };
    }
    if (pressed === SHORTCUTS[control].up) {
      return { action: "adjust", control, direction: 1 };
    }
  }
  return null;
}

// Shortcuts stand down while the user is typing somewhere, holding a
// modifier, or pressing Space on a button (which already clicks it).
export function shouldIgnoreKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  const tag = target && target.tagName;
  if (tag === "SELECT" || tag === "TEXTAREA") return true;
  if (tag === "INPUT" && target.type !== "range") return true;
  if (target && target.isContentEditable) return true;
  if (event.key === " " && (tag === "BUTTON" || tag === "A")) return true;
  return false;
}
