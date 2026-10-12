"use client";

import { useCallback, useState } from "react";
import {
  ExhaustedError,
  fetchCreditBalance,
  type CreditBalance,
  type ExhaustionInfo,
} from "@/lib/search-credits";

export function useSearchCredits() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [exhaustion, setExhaustion] = useState<ExhaustionInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBalance(await fetchCreditBalance());
    } catch {
      // Balance is best-effort; the server remains authoritative.
    }
  }, []);

  const openPaywall = useCallback(
    (info?: ExhaustionInfo | null) => {
      setExhaustion(info ?? null);
      setPaywallOpen(true);
      void refresh();
    },
    [refresh],
  );

  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  /** Returns true when the error was exhaustion (paywall opened). */
  const handleCreditsError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ExhaustedError) {
        openPaywall(err.info);
        void refresh();
        return true;
      }
      return false;
    },
    [openPaywall, refresh],
  );

  const handleUnlocked = useCallback(() => {
    void refresh();
    setPaywallOpen(false);
  }, [refresh]);

  return {
    balance,
    paywallOpen,
    exhaustion,
    refresh,
    openPaywall,
    closePaywall,
    handleCreditsError,
    handleUnlocked,
  };
}
