// Sign in with Google, through Google's own button. Off unless the build is
// given a client id (REACT_APP_GOOGLE_CLIENT_ID, public by design); the API
// checks the credential against the same id.
const SRC = "https://accounts.google.com/gsi/client";

export const googleClientId = () =>
  process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

let loading;

// Resolves to google.accounts.id once Google's script is in the page.
export function loadGoogle() {
  if (window.google?.accounts?.id)
    return Promise.resolve(window.google.accounts.id);
  loading =
    loading ||
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      script.onload = () => resolve(window.google.accounts.id);
      script.onerror = () => {
        loading = null;
        reject(new Error("google sign-in did not load"));
      };
      document.head.appendChild(script);
    });
  return loading;
}
