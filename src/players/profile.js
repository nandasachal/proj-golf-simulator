// The saved player: { id, name, key, account }. The key proves the name is
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

export function saveProfile({ id, name, key, account }) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id, name, key, account: !!account }),
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
