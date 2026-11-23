// The saved player: { id, name, key, account, initials }. The key proves the name is
// theirs, so it stays in this browser; `account` says the name has a password
// and can be logged in to elsewhere. Storage can be missing or full (private windows):
// the game then plays on with no saved player.
const STORAGE_KEY = "golf.player";

export function loadProfile() {
  try {
    const profile = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return profile && profile.id && profile.key ? profile : null;
  } catch {
    return null;
  }
}

export function saveProfile({ id, name, key, account, initials }) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id, name, key, account: !!account, initials }),
    );
  } catch {
    // Not saved: the name will be asked for again.
  }
}

// Logging out: the account is still there to log in to again.
export function clearProfile() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was saved.
  }
}

const first = (word) => Array.from(word || "")[0] || "";

// The first and last name's initials from a Google sign-in, which is the only
// place the game is told a real name. Only the two letters are kept.
export function googleInitials(credential) {
  try {
    const payload = credential.split(".")[1];
    const text = window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(
      decodeURIComponent(
        Array.from(
          text,
          (character) =>
            `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
        ).join(""),
      ),
    );
    const letters = first(claims.given_name) + first(claims.family_name);
    return letters ? letters.toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}

// What goes in the player's circle: the initials Google gave, else two
// letters from the leaderboard name (the first of its first and last words,
// or its first two when it is one word).
export function initialsOf(player) {
  if (player.initials) return player.initials;
  const words = player.name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    words.length > 1
      ? first(words[0]) + first(words[words.length - 1])
      : Array.from(words[0] || "")
          .slice(0, 2)
          .join("");
  return letters.toUpperCase();
}
