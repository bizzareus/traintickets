/**
 * Shared admin check. `localStorage["admin"] === "true"` is set by
 * `AdminPasswordGate` after the admin password is verified. Admins skip
 * product analytics and — for chart alerts — skip the payment popup and
 * create the alert directly.
 */
export function isAdminUser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("admin") === "true";
  } catch {
    return false;
  }
}
