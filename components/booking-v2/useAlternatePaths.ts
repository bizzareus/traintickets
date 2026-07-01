"use client";

import { useCallback, useState } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import type {
  AlternatePathProgressEvent,
  AlternatePathsResponse,
  TrainListItem,
} from "./alternatePathsTypes";

interface UseAlternatePathsOptions {
  /** When true, AC-only classes are requested. Defaults to false. */
  acOnly?: boolean;
  /**
   * Optional guard fired before any search. When it returns true the search is
   * blocked (e.g. during scheduled rail maintenance). Defaults to never block.
   */
  onBlockedSearchAttempt?: () => boolean;
}

export interface UseAlternatePathsResult {
  altForTrain: string | null;
  altTrainName: string | null;
  altAvlClasses: string[] | undefined;
  altLoading: boolean;
  altResult: AlternatePathsResponse | null;
  altError: string | null;
  altProgress: AlternatePathProgressEvent[];
  findAlternates: (
    t: TrainListItem,
    focusTravelClass?: string,
    overrideDate?: string,
  ) => Promise<void>;
  /** Clears all alternate-path state. */
  reset: () => void;
  /** Imperatively display a precomputed result for a given train. */
  showResult: (args: {
    trainNumber: string;
    trainName?: string | null;
    avlClasses?: string[];
    result: AlternatePathsResponse;
  }) => void;
  /** Imperatively set the result/train (used for headless screenshot injection). */
  setAltResult: (r: AlternatePathsResponse | null) => void;
  setAltForTrain: (n: string | null) => void;
  setAltTrainName: (n: string | null) => void;
}

/**
 * Shared alternate-paths engine. Owns alt-path state and the SSE streaming
 * `findAlternates` call. `journeyDate`/from/to are derived from the train arg +
 * the 3rd date arg, so the hook needs no page-level state.
 *
 * Behaviour is identical to the original inline `findAlternates` in page.tsx,
 * including all analytics events and the ticket metadata payload.
 */
export function useAlternatePaths(
  options: UseAlternatePathsOptions = {},
): UseAlternatePathsResult {
  const acOnly = options.acOnly ?? false;
  const onBlockedSearchAttempt =
    options.onBlockedSearchAttempt ?? (() => false);

  const [altForTrain, setAltForTrain] = useState<string | null>(null);
  const [altTrainName, setAltTrainName] = useState<string | null>(null);
  const [altAvlClasses, setAltAvlClasses] = useState<string[] | undefined>();
  const [altLoading, setAltLoading] = useState(false);
  const [altResult, setAltResult] = useState<AlternatePathsResponse | null>(
    null,
  );
  const [altError, setAltError] = useState<string | null>(null);
  const [altProgress, setAltProgress] = useState<AlternatePathProgressEvent[]>(
    [],
  );

  const findAlternates = useCallback(
    async (
      t: TrainListItem,
      focusTravelClass?: string,
      overrideDate?: string,
    ) => {
      if (onBlockedSearchAttempt()) return;
      const targetDate = overrideDate;
      if (!targetDate) return;
      /** Alternate-path probes use this train’s run endpoints (e.g. NDLS → CSMT), not only the user’s search pair. */
      const fromCode = (t.fromStnCode ?? "").trim().toUpperCase();
      const toCode = (t.toStnCode ?? "").trim().toUpperCase();
      if (!fromCode || !toCode) return;

      const fc = focusTravelClass?.trim().toUpperCase();
      const isAcClass = (c: string) =>
        !["SL", "2S", "GN", "FC"].includes(c.toUpperCase());
      let baseClasses =
        t.avlClasses && t.avlClasses.length > 0 ? t.avlClasses : undefined;
      if (acOnly && baseClasses) {
        baseClasses = baseClasses.filter(isAcClass);
      }

      const avlClassesForRequest = fc && fc.length > 0 ? [fc] : baseClasses;

      setAltForTrain(t.trainNumber);
      setAltTrainName(t.trainName?.trim() ? t.trainName.trim() : null);
      setAltAvlClasses(avlClassesForRequest);
      setAltLoading(true);
      setAltError(null);
      setAltResult(null);
      setAltProgress([]);

      trackAnalyticsEvent({
        name: "alternate_paths_popup_viewed",
        properties: {
          train_number: t.trainNumber,
          from_code: fromCode,
          to_code: toCode,
          journey_date: targetDate,
          trainStartDate: t.trainStartDate,
        },
      });

      const body = JSON.stringify({
        trainNumber: t.trainNumber,
        from: fromCode,
        to: toCode,
        date: targetDate,
        quota: "GN",
        ...(avlClassesForRequest && avlClassesForRequest.length > 0
          ? { avlClasses: avlClassesForRequest }
          : {}),
      });

      try {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/booking-v2/alternate-paths/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );

        if (!resp.ok || !resp.body) {
          let msg = `Request failed (${resp.status})`;
          try {
            const j = (await resp.json()) as { message?: string };
            if (j.message) msg = j.message;
          } catch {
            /* ignore */
          }
          setAltError(msg);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as {
                type: string;
                event?: AlternatePathProgressEvent;
                data?: AlternatePathsResponse;
                cached?: boolean;
                message?: string;
              };
              if (msg.type === "progress" && msg.event) {
                setAltProgress((prev) => [...prev, msg.event!]);
              } else if (msg.type === "result" && msg.data) {
                console.info(
                  `[alt-paths] ${msg.cached ? "cache HIT" : "computed"} ${t.trainNumber} ${fromCode}→${toCode} ${targetDate} classes=${avlClassesForRequest?.join(",") ?? "ALL"}`,
                );
                setAltResult(msg.data);
                // Attach the available tickets/segments shown in the popup.
                const tickets = (msg.data.legs ?? []).map((leg) => ({
                  from: leg.from,
                  to: leg.to,
                  kind: leg.segmentKind,
                  travel_class: leg.travelClass,
                  availability:
                    leg.availabilityDisplayName ?? leg.availablityStatus,
                  fare: leg.fare,
                }));
                trackAnalyticsEvent({
                  name: "alternate_paths_popup_loaded",
                  properties: {
                    train_number: t.trainNumber,
                    from_code: fromCode,
                    to_code: toCode,
                    journey_date: targetDate,
                    success: true,
                    trainStartDate: t.trainStartDate,
                    is_complete: msg.data.isComplete,
                    leg_count: msg.data.legCount,
                    total_fare: msg.data.totalFare,
                    tickets,
                  },
                });
              } else if (msg.type === "error") {
                setAltError(msg.message ?? "Unknown error");
                trackAnalyticsEvent({
                  name: "alternate_paths_popup_loaded",
                  properties: {
                    train_number: t.trainNumber,
                    from_code: fromCode,
                    to_code: toCode,
                    journey_date: targetDate,
                    success: false,
                    trainStartDate: t.trainStartDate,
                  },
                });
              }
            } catch {
              /* malformed line — skip */
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setAltError(msg);
      } finally {
        setAltLoading(false);
      }
    },
    [acOnly, onBlockedSearchAttempt],
  );

  const reset = useCallback(() => {
    setAltResult(null);
    setAltError(null);
    setAltForTrain(null);
    setAltTrainName(null);
    setAltAvlClasses(undefined);
  }, []);

  const showResult = useCallback(
    (args: {
      trainNumber: string;
      trainName?: string | null;
      avlClasses?: string[];
      result: AlternatePathsResponse;
    }) => {
      setAltForTrain(args.trainNumber);
      setAltTrainName(args.trainName?.trim() || null);
      setAltAvlClasses(args.avlClasses);
      setAltResult(args.result);
      setAltError(null);
      setAltProgress([]);
    },
    [],
  );

  return {
    altForTrain,
    altTrainName,
    altAvlClasses,
    altLoading,
    altResult,
    altError,
    altProgress,
    findAlternates,
    reset,
    showResult,
    setAltResult,
    setAltForTrain,
    setAltTrainName,
  };
}
