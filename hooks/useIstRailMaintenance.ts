"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMinutesUntilIndianRailwaysMaintenanceEnds,
  isIstIndianRailwaysNightlyMaintenanceWindow,
} from "@/lib/istRailMaintenance";

const REFRESH_MS = 30_000;

/**
 * Tracks the nightly IRCTC maintenance window (IST) for the banner and
 * countdown. The modal opens only when {@link onBlockedSearchAttempt} runs
 * (e.g. user clicks Search while the window is active).
 */
export function useIstRailMaintenance(mounted: boolean) {
  const [inWindow, setInWindow] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const w = isIstIndianRailwaysNightlyMaintenanceWindow();
      if (!w) setMaintenanceModalOpen(false);
      setInWindow(w);
      setMinutesLeft(w ? getMinutesUntilIndianRailwaysMaintenanceEnds() : null);
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const blockSearch = mounted && inWindow;

  const displayMinutes = useMemo(
    () =>
      minutesLeft ??
      (blockSearch ? getMinutesUntilIndianRailwaysMaintenanceEnds() : null) ??
      1,
    [minutesLeft, blockSearch],
  );

  const dismissMaintenanceModal = useCallback(() => {
    setMaintenanceModalOpen(false);
  }, []);

  const onBlockedSearchAttempt = useCallback(() => {
    if (!isIstIndianRailwaysNightlyMaintenanceWindow()) return false;
    setMinutesLeft(getMinutesUntilIndianRailwaysMaintenanceEnds());
    setMaintenanceModalOpen(true);
    return true;
  }, []);

  return {
    showBanner: blockSearch,
    maintenanceModalOpen,
    dismissMaintenanceModal,
    displayMinutes,
    onBlockedSearchAttempt,
  };
}
