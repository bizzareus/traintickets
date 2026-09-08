"use client";

import { useCallback, useState } from "react";

/**
 * Single place for the visitor's own contact details (email / mobile).
 *
 * Every form on the platform that asks for the *visitor's own* email or
 * mobile (alert signups, tatkal reminder, auth, unsubscribe) reads from
 * here on mount and writes back on successful submit — so a contact typed
 * once is prefilled everywhere else. Stored under the historic
 * `lastBerth_monitor_contact` key, so previously saved contacts keep working.
 *
 * Do NOT use this for admin tools that operate on *other people's*
 * recipients (e.g. app/admin/unsubscribes).
 */
export const MONITOR_CONTACT_STORAGE_KEY = "lastBerth_monitor_contact";

export type StoredContact = { email: string; mobile: string };

const EMPTY_CONTACT: StoredContact = { email: "", mobile: "" };

function asStoredString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Read the stored contact. SSR-safe; always returns `{ email, mobile }`. */
export function getStoredContact(): StoredContact {
  try {
    if (typeof window === "undefined") return { ...EMPTY_CONTACT };
    const raw = window.localStorage.getItem(MONITOR_CONTACT_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CONTACT };
    const o = JSON.parse(raw) as { email?: unknown; mobile?: unknown };
    return {
      email: asStoredString(o.email),
      mobile: asStoredString(o.mobile),
    };
  } catch {
    return { ...EMPTY_CONTACT };
  }
}

/**
 * Merge the given fields into the stored contact. Omitted fields keep
 * their previous value, so single-field forms (login, register) never
 * wipe the other field. Email is trimmed + lowercased, mobile trimmed.
 */
export function saveStoredContact(partial: {
  email?: string;
  mobile?: string;
}): void {
  try {
    if (typeof window === "undefined") return;
    const prev = getStoredContact();
    const email =
      partial.email !== undefined
        ? partial.email.trim().toLowerCase()
        : prev.email;
    const mobile =
      partial.mobile !== undefined ? partial.mobile.trim() : prev.mobile;
    window.localStorage.setItem(
      MONITOR_CONTACT_STORAGE_KEY,
      JSON.stringify({ email, mobile }),
    );
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Drop-in `{ email, setEmail, mobile, setMobile }` state pair, prefilled
 * from storage. Call `persistContact()` on successful submit to write
 * the current values back (merged).
 */
export function useContactFields(): {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  mobile: string;
  setMobile: React.Dispatch<React.SetStateAction<string>>;
  persistContact: () => void;
} {
  const [email, setEmail] = useState(() => getStoredContact().email);
  const [mobile, setMobile] = useState(() => getStoredContact().mobile);
  const persistContact = useCallback(() => {
    saveStoredContact({ email, mobile });
  }, [email, mobile]);
  return { email, setEmail, mobile, setMobile, persistContact };
}
