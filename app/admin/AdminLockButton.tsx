"use client";

const SESSION_KEY = "railchart_admin_unlocked";

export default function AdminLockButton() {
  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={lock}
      className="text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      Lock admin
    </button>
  );
}
