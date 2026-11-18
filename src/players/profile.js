// The saved player: { id, name, key }. The key proves the name is theirs, so
// it stays in this browser. Storage can be missing or full (private windows):
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

export function saveProfile({ id, name, key }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name, key }));
  } catch {
    // Not saved: the name will be asked for again.
  }
}
