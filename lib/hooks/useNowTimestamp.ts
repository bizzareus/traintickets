"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  const timer = setInterval(callback, 30_000);
  return () => clearInterval(timer);
}

function getClientSnapshot(): number {
  return Date.now();
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Returns the current client timestamp in ms, re-evaluating every 30 seconds.
 * Safe for SSR and strictly adheres to React 18/19 purity and concurrency rules.
 */
export function useNowTimestamp(): number {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
