/**
 * Shared admin check. `localStorage["admin"] === "true"` is set by
 * `AdminPasswordGate` after the admin password is verified. Admins skip
 * product analytics and — for chart alerts — skip the payment popup and
 * create the alert directly.
 */
export function isAdminUser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const adminParam = urlParams.get("admin");
    if (adminParam === "1" || adminParam === "true") {
      window.localStorage.setItem("admin", "true");
      return true;
    }
    return window.localStorage.getItem("admin") === "true";
  } catch {
    return false;
  }
}
