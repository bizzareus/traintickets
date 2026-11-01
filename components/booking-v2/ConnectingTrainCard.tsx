"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  memo,
} from "react";
import { ChevronDown, ChevronUp, Clock, Train } from "lucide-react";
import { formatTimeAmPm } from "./alternatePathHelpers";
import {
  formatDuration,
  formatLayover,
  connectingJourneyToBookingProps,
  type ConnectingJourneyDto,
} from "@/lib/connectingTrains";
import {
  SplitTicketBookingFlow,
  type SplitTicketBookingFlowProps,
} from "./SplitTicketBookingFlow";
import { useSplitBookingFeatureFlag } from "@/lib/hooks/useSplitBookingFeatureFlag";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import type {
  AlternateLeg,
  AlternatePathProgressEvent,
  AlternatePathsResponse,
} from "./alternatePathsTypes";

interface ConnectingTrainCardProps {
  journey: ConnectingJourneyDto;
  journeyDate?: string | null;
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  selectedClasses?: string[];
  acOnly?: boolean;
  autoScanEnabled?: boolean;
  onOpenFullResultModal?: (args: {
    trainNumber: string;
    trainName?: string | null;
    avlClasses?: string[];
    result: AlternatePathsResponse;
  }) => void;
}

interface FoundSeatNotice {
  id: string;
  trainNumber: string;
  from: string;
  to: string;
  travelClass: string;
  fare: number | null;
}

interface CombinedScanResult {
  res1: AlternatePathsResponse | null;
  res2: AlternatePathsResponse | null;
  isBothConfirmed: boolean;
  totalFare: number;
  confirmedCount: number;
  allLegs: AlternateLeg[];
  summary?: string;
}

const NON_AC_CLASSES = new Set(["SL", "2S", "GN", "FC"]);

function buildConnectingAlternateResult({
  journey,
  combinedResult,
  selectedClass,
  fallbackBaseFare1,
  fallbackBaseFare2,
  fromName,
  toName,
}: {
  journey: ConnectingJourneyDto;
  combinedResult: CombinedScanResult | null;
  selectedClass: string;
  fallbackBaseFare1: number;
  fallbackBaseFare2: number;
  fromName?: string;
  toName?: string;
}): AlternatePathsResponse {
  const leg1 = journey.legs[0];
  const leg2 = journey.legs[1];

  let legs: AlternateLeg[] = [];
  if (combinedResult?.allLegs && combinedResult.allLegs.length > 0) {
    legs = combinedResult.allLegs;
  } else {
    const leg1Opt = leg1.confirmedClassOptions?.find(
      (o) => o.travelClass === selectedClass,
    );
    const leg2Opt = leg2.confirmedClassOptions?.find(
      (o) => o.travelClass === selectedClass,
    );
    legs = [
      {
        from: leg1.from,
        to: leg1.to,
        segmentKind: "confirmed",
        trainNumber: leg1.trainNumber,
        trainName: leg1.trainName,
        travelClass: selectedClass,
        railDataStatus: "AVAILABLE",
        availablityStatus: "AVAILABLE",
        predictionPercentage: null,
        availabilityDisplayName:
          leg1Opt?.availabilityDisplayName ??
          leg1.availabilityDisplayName ??
          "Available",
        fare: leg1Opt?.fare ?? leg1.fare ?? fallbackBaseFare1,
        departureTime: leg1.departureTime,
        arrivalTime: leg1.arrivalTime,
        durationMinutes: leg1.durationMinutes,
        boardingDate: leg1.boardingDate,
      },
      {
        from: leg2.from,
        to: leg2.to,
        segmentKind: "confirmed",
        trainNumber: leg2.trainNumber,
        trainName: leg2.trainName,
        travelClass: selectedClass,
        railDataStatus: "AVAILABLE",
        availablityStatus: "AVAILABLE",
        predictionPercentage: null,
        availabilityDisplayName:
          leg2Opt?.availabilityDisplayName ??
          leg2.availabilityDisplayName ??
          "Available",
        fare: leg2Opt?.fare ?? leg2.fare ?? fallbackBaseFare2,
        departureTime: leg2.departureTime,
        arrivalTime: leg2.arrivalTime,
        durationMinutes: leg2.durationMinutes,
        boardingDate: leg2.boardingDate,
      },
    ];
  }

  const totalFare =
    combinedResult?.totalFare && combinedResult.totalFare > 0
      ? combinedResult.totalFare
      : legs.reduce((acc, l) => acc + (l.fare ?? 0), 0);

  const confirmedLegCount = legs.filter(
    (l) => l.segmentKind === "confirmed",
  ).length;

  return {
    trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
    legs,
    totalFare,
    legCount: confirmedLegCount,
    isComplete: Boolean(
      combinedResult?.isBothConfirmed ?? journey.isFullyConfirmed,
    ),
    stationCodesOnRoute: [
      journey.from,
      journey.intermediateStation,
      journey.to,
    ],
    stationNameMap: {
      [journey.from]: fromName || journey.from,
      [journey.intermediateStation]: journey.intermediateStationName,
      [journey.to]: toName || journey.to,
      ...(combinedResult?.res1?.stationNameMap || {}),
      ...(combinedResult?.res2?.stationNameMap || {}),
    },
    trainStartDate: journey.journeyDate,
  };
}

export const ConnectingTrainCard = memo(function ConnectingTrainCard({
  journey,
  fromCode: searchFrom,
  fromName,
  toCode: searchTo,
  toName,
  selectedClasses,
  acOnly = false,
  autoScanEnabled = false,
  onOpenFullResultModal,
}: ConnectingTrainCardProps) {
  const isSplitBookingEnabled = useSplitBookingFeatureFlag();
  const [bookingRequest, setBookingRequest] =
    useState<SplitTicketBookingFlowProps | null>(null);

  const [selectedClass, setSelectedClass] = useState<string>(
    journey.preferredClass,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [foundSeats, setFoundSeats] = useState<FoundSeatNotice[]>([]);
  const [combinedResult, setCombinedResult] =
    useState<CombinedScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasAutoScannedRef = useRef(false);

  const leg1 = journey.legs[0];
  const leg2 = journey.legs[1];

  const fromCode = (journey.from || searchFrom || "").trim().toUpperCase();
  const toCode = (journey.to || searchTo || "").trim().toUpperCase();

  // Extract available common classes across both legs
  const commonClasses = useMemo(() => {
    const l1 = new Set(
      leg1.confirmedClassOptions?.map((o) => o.travelClass) ?? [
        leg1.travelClass,
      ],
    );
    return (
      leg2.confirmedClassOptions?.map((o) => o.travelClass) ?? [
        leg2.travelClass,
      ]
    ).filter((c) => l1.has(c));
  }, [leg1, leg2]);

  // Pricing for the currently selected class
  const leg1ChosenOpt = useMemo(
    () => leg1.confirmedClassOptions?.find((o) => o.travelClass === selectedClass),
    [leg1, selectedClass],
  );
  const leg2ChosenOpt = useMemo(
    () => leg2.confirmedClassOptions?.find((o) => o.travelClass === selectedClass),
    [leg2, selectedClass],
  );

  const baseFare1 = leg1ChosenOpt?.fare ?? leg1.fare ?? 0;
  const baseFare2 = leg2ChosenOpt?.fare ?? leg2.fare ?? 0;
  const initialTotalFare = baseFare1 + baseFare2;

  const displayFare = combinedResult?.totalFare ?? initialTotalFare;

  // Determine confirmation state
  const isInitialConfirmed =
    (leg1ChosenOpt ? leg1ChosenOpt.isConfirmed : leg1.isConfirmed) &&
    (leg2ChosenOpt ? leg2ChosenOpt.isConfirmed : leg2.isConfirmed);

  const isBothConfirmed = combinedResult
    ? combinedResult.isBothConfirmed
    : isInitialConfirmed;

  const isOvernight = journey.arrivalDate !== journey.journeyDate;

  // Abort scan on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Compute probe classes
  const targetClasses = useMemo(() => {
    let list =
      selectedClasses && selectedClasses.length > 0
        ? selectedClasses
        : commonClasses.length > 0
          ? commonClasses
          : ["SL", "3A", "2A", "1A"];

    if (acOnly) {
      list = list.filter((c) => !NON_AC_CLASSES.has(c.toUpperCase()));
    }
    return list.length > 0 ? list : ["3A", "2A"];
  }, [selectedClasses, commonClasses, acOnly]);

  /**
   * Streams alternate paths for a single leg using POST /api/booking-v2/alternate-paths/stream
   */
  const streamSingleLeg = useCallback(
    async (
      trainNumber: string,
      fromStation: string,
      toStation: string,
      boardingDate: string,
      signal: AbortSignal,
    ): Promise<AlternatePathsResponse | null> => {
      const payload = {
        trainNumber,
        from: fromStation,
        to: toStation,
        date: boardingDate,
        quota: "GN",
        avlClasses: targetClasses,
      };

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/booking-v2/alternate-paths/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        },
      );

      if (!resp.ok || !resp.body) {
        return null;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalData: AlternatePathsResponse | null = null;

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
              message?: string;
            };

            if (msg.type === "progress" && msg.event) {
              const ev = msg.event;
              // Smooth percentage increments based on search milestones
              setScanProgress((prev) => {
                let delta = 3;
                if (ev.type === "schedule_ok") delta = 8;
                else if (ev.type === "route_ok") delta = 8;
                else if (ev.type === "probing_hop") delta = 5;
                else if (
                  ev.type === "hop_confirmed" ||
                  ev.type === "hop_unavailable"
                )
                  delta = 6;
                else if (ev.type === "done") delta = 12;
                return Math.min(98, Math.max(prev + 1, prev + delta));
              });

              if (ev.type === "hop_confirmed") {
                const notice: FoundSeatNotice = {
                  id: `${trainNumber}-${ev.from}-${ev.to}-${ev.travelClass}-${ev.hopIndex}`,
                  trainNumber,
                  from: ev.from,
                  to: ev.to,
                  travelClass: ev.travelClass,
                  fare: ev.fare,
                };
                setFoundSeats((prev) => {
                  if (prev.some((p) => p.id === notice.id)) return prev;
                  return [...prev, notice];
                });
              }
            } else if (msg.type === "result" && msg.data) {
              finalData = msg.data;
            }
          } catch {
            /* ignore JSON parse errors */
          }
        }
      }

      return finalData;
    },
    [targetClasses],
  );

  /**
   * Executes the stream search on Train 1 (A ➔ B) and Train 2 (B ➔ C) concurrently
   * using the exact same /api/booking-v2/alternate-paths/stream API.
   */
  const executeScan = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setScanProgress(8);
    setError(null);
    setFoundSeats([]);

    trackAnalyticsEvent({
      name: "connecting_train_search_tickets_clicked",
      properties: {
        journey_id: journey.id,
        train1: leg1.trainNumber,
        train2: leg2.trainNumber,
        hub: journey.intermediateStation,
        selected_class: selectedClass,
      },
    });

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Concurrently stream both legs using POST /api/booking-v2/alternate-paths/stream
      const [res1, res2] = await Promise.all([
        streamSingleLeg(
          leg1.trainNumber,
          leg1.from,
          leg1.to,
          leg1.boardingDate,
          controller.signal,
        ),
        streamSingleLeg(
          leg2.trainNumber,
          leg2.from,
          leg2.to,
          leg2.boardingDate,
          controller.signal,
        ),
      ]);

      const hasLeg1Seats = Boolean(
        (res1?.legs &&
          res1.legs.some(
            (l) => l.segmentKind === "confirmed" && l.travelClass,
          )) ||
          leg1.isConfirmed,
      );
      const hasLeg2Seats = Boolean(
        (res2?.legs &&
          res2.legs.some(
            (l) => l.segmentKind === "confirmed" && l.travelClass,
          )) ||
          leg2.isConfirmed,
      );

      const bothConfirmed = hasLeg1Seats && hasLeg2Seats;

      // Map legs retaining specific train identity
      const legs1Mapped: AlternateLeg[] =
        res1?.legs && res1.legs.length > 0
          ? res1.legs.map((l) => ({
              ...l,
              trainNumber: leg1.trainNumber,
              trainName: leg1.trainName,
            }))
          : hasLeg1Seats
            ? [
                {
                  from: leg1.from,
                  to: leg1.to,
                  segmentKind: "confirmed" as const,
                  trainNumber: leg1.trainNumber,
                  trainName: leg1.trainName,
                  travelClass: selectedClass,
                  railDataStatus: "AVAILABLE",
                  availablityStatus: "AVAILABLE",
                  predictionPercentage: null,
                  availabilityDisplayName:
                    leg1ChosenOpt?.availabilityDisplayName ??
                    leg1.availabilityDisplayName ??
                    "Available",
                  fare: baseFare1,
                  departureTime: leg1.departureTime,
                  arrivalTime: leg1.arrivalTime,
                  durationMinutes: leg1.durationMinutes,
                  boardingDate: leg1.boardingDate,
                },
              ]
            : [];

      const legs2Mapped: AlternateLeg[] =
        res2?.legs && res2.legs.length > 0
          ? res2.legs.map((l) => ({
              ...l,
              trainNumber: leg2.trainNumber,
              trainName: leg2.trainName,
            }))
          : hasLeg2Seats
            ? [
                {
                  from: leg2.from,
                  to: leg2.to,
                  segmentKind: "confirmed" as const,
                  trainNumber: leg2.trainNumber,
                  trainName: leg2.trainName,
                  travelClass: selectedClass,
                  railDataStatus: "AVAILABLE",
                  availablityStatus: "AVAILABLE",
                  predictionPercentage: null,
                  availabilityDisplayName:
                    leg2ChosenOpt?.availabilityDisplayName ??
                    leg2.availabilityDisplayName ??
                    "Available",
                  fare: baseFare2,
                  departureTime: leg2.departureTime,
                  arrivalTime: leg2.arrivalTime,
                  durationMinutes: leg2.durationMinutes,
                  boardingDate: leg2.boardingDate,
                },
              ]
            : [];

      const combinedLegs: AlternateLeg[] = [...legs1Mapped, ...legs2Mapped];
      const fare1 = res1?.totalFare ?? baseFare1;
      const fare2 = res2?.totalFare ?? baseFare2;
      const discoveredTotalFare = (fare1 || 0) + (fare2 || 0);
      const confirmedCount =
        (res1?.legCount || (hasLeg1Seats ? 1 : 0)) +
        (res2?.legCount || (hasLeg2Seats ? 1 : 0));

      let summary = "";
      if (bothConfirmed) {
        summary = `Confirmed seats found on Train 1 (${leg1.trainNumber}) and Train 2 (${leg2.trainNumber})!`;
      } else if (hasLeg1Seats && !hasLeg2Seats) {
        summary = `Train 1 (${leg1.trainNumber}): Seats found • Train 2 (${leg2.trainNumber}): Waitlisted`;
      } else if (!hasLeg1Seats && hasLeg2Seats) {
        summary = `Train 1 (${leg1.trainNumber}): Waitlisted • Train 2 (${leg2.trainNumber}): Seats found`;
      } else {
        summary = "All classes waitlisted on connecting trains";
      }

      setCombinedResult({
        res1,
        res2,
        isBothConfirmed: bothConfirmed,
        totalFare:
          discoveredTotalFare > 0 ? discoveredTotalFare : initialTotalFare,
        confirmedCount,
        allLegs: combinedLegs,
        summary,
      });
      setScanProgress(100);

      // Whenever available seats are found show that popup
      if (bothConfirmed && combinedLegs.length > 0) {
        const fullResult: AlternatePathsResponse = {
          trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
          legs: combinedLegs,
          totalFare:
            discoveredTotalFare > 0 ? discoveredTotalFare : initialTotalFare,
          legCount: combinedLegs.filter((l) => l.segmentKind === "confirmed")
            .length,
          isComplete: true,
          stationCodesOnRoute: [
            journey.from,
            journey.intermediateStation,
            journey.to,
          ],
          stationNameMap: {
            [journey.from]: fromName || journey.from,
            [journey.intermediateStation]: journey.intermediateStationName,
            [journey.to]: toName || journey.to,
            ...(res1?.stationNameMap || {}),
            ...(res2?.stationNameMap || {}),
          },
          trainStartDate: journey.journeyDate,
        };

        onOpenFullResultModal?.({
          trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
          trainName: `${leg1.trainName} ➔ ${leg2.trainName}`,
          avlClasses: targetClasses,
          result: fullResult,
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setError(
          err instanceof Error ? err.message : "Search failed. Please retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    baseFare1,
    baseFare2,
    fromName,
    initialTotalFare,
    journey.from,
    journey.id,
    journey.intermediateStation,
    journey.intermediateStationName,
    journey.journeyDate,
    journey.to,
    leg1,
    leg1ChosenOpt?.availabilityDisplayName,
    leg2,
    leg2ChosenOpt?.availabilityDisplayName,
    loading,
    onOpenFullResultModal,
    selectedClass,
    streamSingleLeg,
    targetClasses,
    toName,
  ]);

  // Auto-scan on mount if enabled and not already confirmed
  useEffect(() => {
    if (autoScanEnabled && !isBothConfirmed && !hasAutoScannedRef.current) {
      hasAutoScannedRef.current = true;
      void executeScan();
    }
  }, [autoScanEnabled, isBothConfirmed, executeScan]);

  const handleBookNow = useCallback(() => {
    trackAnalyticsEvent({
      name: "connecting_train_book_now_clicked",
      properties: {
        journey_id: journey.id,
        train1: leg1.trainNumber,
        train2: leg2.trainNumber,
        total_fare: displayFare,
        selected_class: selectedClass,
        is_both_confirmed: isBothConfirmed,
      },
    });

    if (combinedResult?.allLegs && combinedResult.allLegs.length > 0) {
      // Build checkout request with discovered legs
      setBookingRequest({
        trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
        trainName: `${leg1.trainName} ➔ ${leg2.trainName}`,
        journeyDate: journey.journeyDate,
        legs: combinedResult.allLegs,
        stationNameMap: {
          [journey.from]: journey.from,
          [journey.intermediateStation]: journey.intermediateStationName,
          [journey.to]: journey.to,
          ...(combinedResult.res1?.stationNameMap || {}),
          ...(combinedResult.res2?.stationNameMap || {}),
        },
        onClose: () => setBookingRequest(null),
      });
      return;
    }

    // Fallback: standard connecting journey mapping
    const adjustedJourney: ConnectingJourneyDto = {
      ...journey,
      preferredClass: selectedClass,
      totalFare: displayFare,
      isFullyConfirmed: isBothConfirmed,
      legs: [
        {
          ...leg1,
          travelClass: selectedClass,
          fare: baseFare1,
          isConfirmed: isBothConfirmed,
        },
        {
          ...leg2,
          travelClass: selectedClass,
          fare: baseFare2,
          isConfirmed: isBothConfirmed,
        },
      ],
    };

    const props = connectingJourneyToBookingProps(adjustedJourney, () =>
      setBookingRequest(null),
    );
    setBookingRequest(props);
  }, [
    baseFare1,
    baseFare2,
    combinedResult,
    displayFare,
    isBothConfirmed,
    journey,
    leg1,
    leg2,
    selectedClass,
  ]);

  const handleOpenPopupOrBooking = useCallback(() => {
    if (onOpenFullResultModal && isBothConfirmed) {
      const fullResult = buildConnectingAlternateResult({
        journey,
        combinedResult,
        selectedClass,
        fallbackBaseFare1: baseFare1,
        fallbackBaseFare2: baseFare2,
        fromName,
        toName,
      });

      onOpenFullResultModal({
        trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
        trainName: `${leg1.trainName} ➔ ${leg2.trainName}`,
        avlClasses: targetClasses,
        result: fullResult,
      });
      return;
    }

    handleBookNow();
  }, [
    onOpenFullResultModal,
    isBothConfirmed,
    journey,
    combinedResult,
    selectedClass,
    baseFare1,
    baseFare2,
    fromName,
    toName,
    leg1.trainNumber,
    leg1.trainName,
    leg2.trainNumber,
    leg2.trainName,
    targetClasses,
    handleBookNow,
  ]);

  const handleCardClick = () => {
    if (isBothConfirmed) {
      handleOpenPopupOrBooking();
    } else if (!loading && !combinedResult) {
      void executeScan();
    } else {
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <>
      <li
        onClick={handleCardClick}
        className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/20 hover:border-slate-300 sm:p-5"
      >
        <div className="flex flex-col justify-between gap-4 sm:gap-5 md:flex-row md:items-center">
          {/* Left Section: Train Info, Stopover Badges, Timing, Route Stations */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 pb-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600 sm:text-lg">
                <span className="font-mono text-slate-800">
                  {leg1.trainNumber}
                </span>{" "}
                <span className="font-semibold text-slate-700">
                  {leg1.trainName}
                </span>
                <span className="mx-2 text-slate-400">➔</span>
                <span className="font-mono text-slate-800">
                  {leg2.trainNumber}
                </span>{" "}
                <span className="font-semibold text-slate-700">
                  {leg2.trainName}
                </span>
              </h2>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  <span>{isExpanded ? "Hide" : "Route"} Details</span>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                {isBothConfirmed ? (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    Both Confirmed
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    1 Stop · via {journey.intermediateStation}
                  </span>
                )}
              </div>
            </div>

            {/* Timing & Route Row (Flight Style: Departure -> 1 Stop Duration -> Arrival) */}
            <div className="mt-2 flex items-center justify-between gap-2 text-slate-700 sm:gap-6">
              {/* Departure */}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                  {formatTimeAmPm(journey.departureTime) ?? "—"}
                </span>
                <span
                  className="mt-0.5 truncate text-xs font-semibold text-slate-600"
                  title={`${fromCode}${fromName ? ` - ${fromName}` : ""}`}
                >
                  <span className="font-bold text-slate-800">{fromCode}</span>
                  {fromName && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      - {fromName}
                    </span>
                  )}
                </span>
              </div>

              {/* Duration Visual Divider with Flight-style 1 Stopover Dot */}
              <div className="flex shrink-0 flex-col items-center px-1">
                <span className="text-[11px] font-medium text-slate-400 sm:text-xs">
                  {formatDuration(journey.totalDurationMinutes)}
                </span>
                <div className="relative my-1 flex w-20 items-center justify-center sm:w-32">
                  <div className="h-0.5 w-full bg-slate-200" />
                  <span
                    className="absolute h-2 w-2 rounded-full border-2 border-amber-500 bg-white"
                    title={`1 stop layover at ${journey.intermediateStationName} (${journey.intermediateStation})`}
                  />
                </div>
                <span className="text-[10px] font-bold text-amber-700 sm:text-[11px]">
                  1 stop ({formatLayover(journey.layoverMinutes)}{" "}
                  {journey.intermediateStation})
                </span>
              </div>

              {/* Arrival */}
              <div className="flex min-w-0 flex-1 flex-col items-end text-right">
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                    {formatTimeAmPm(journey.arrivalTime) ?? "—"}
                  </span>
                  {isOvernight && (
                    <span className="rounded bg-purple-100 px-1 py-0.2 text-[10px] font-extrabold text-purple-700">
                      +1d
                    </span>
                  )}
                </div>
                <span
                  className="mt-0.5 max-w-full truncate text-xs font-semibold text-slate-600"
                  title={`${toCode}${toName ? ` - ${toName}` : ""}`}
                >
                  <span className="font-bold text-slate-800">{toCode}</span>
                  {toName && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      - {toName}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Live percentage of completion bar and discovered seat badges */}
            {loading && (
              <div className="mt-3 w-full max-w-md">
                <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-blue-700">
                    <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span>Searching tickets...</span>
                  </span>
                  <span className="font-mono text-xs font-extrabold text-blue-600">
                    {scanProgress}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                {foundSeats.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {foundSeats.slice(-4).map((seat) => (
                      <span
                        key={seat.id}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700"
                      >
                        <span>
                          ✓ {seat.trainNumber}: {seat.from} → {seat.to}
                        </span>
                        <span className="font-semibold text-emerald-800">
                          ({seat.travelClass}
                          {seat.fare ? ` · ₹${seat.fare}` : ""})
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scan completed summary banner */}
            {!loading && combinedResult && (
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:px-3 ${
                    combinedResult.isBothConfirmed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <span>{combinedResult.isBothConfirmed ? "✓" : "ℹ"}</span>
                  <span className="max-w-[340px] truncate sm:max-w-none">
                    {combinedResult.summary}
                  </span>
                </span>
              </div>
            )}

            {/* Expandable Route Details Drawer */}
            {isExpanded && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4"
              >
                <div className="space-y-2.5">
                  {/* Leg 1 Summary */}
                  <div className="flex flex-col justify-between gap-1 rounded-lg border border-slate-200/60 bg-white p-2.5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-xs">
                      <Train className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="font-bold text-slate-900">
                        {leg1.trainNumber} {leg1.trainName}
                      </span>
                      <span className="text-slate-500">
                        ({leg1.from} {leg1.departureTime} ➔ {leg1.to}{" "}
                        {leg1.arrivalTime})
                      </span>
                    </div>
                    <div className="text-right text-xs">
                      <span
                        className={`font-bold ${isBothConfirmed ? "text-emerald-700" : "text-slate-600"}`}
                      >
                        {leg1ChosenOpt?.availabilityDisplayName ??
                          leg1.availabilityDisplayName}
                      </span>
                      {baseFare1 > 0 && (
                        <span className="ml-1 text-slate-500">
                          ₹{baseFare1}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Transfer Layover Indicator */}
                  <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-amber-800">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>
                      {formatLayover(journey.layoverMinutes)} Layover at{" "}
                      {journey.intermediateStationName} (
                      {journey.intermediateStation})
                    </span>
                  </div>

                  {/* Leg 2 Summary */}
                  <div className="flex flex-col justify-between gap-1 rounded-lg border border-slate-200/60 bg-white p-2.5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-xs">
                      <Train className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="font-bold text-slate-900">
                        {leg2.trainNumber} {leg2.trainName}
                      </span>
                      <span className="text-slate-500">
                        ({leg2.from} {leg2.departureTime} ➔ {leg2.to}{" "}
                        {leg2.arrivalTime})
                      </span>
                    </div>
                    <div className="text-right text-xs">
                      <span
                        className={`font-bold ${isBothConfirmed ? "text-emerald-700" : "text-slate-600"}`}
                      >
                        {leg2ChosenOpt?.availabilityDisplayName ??
                          leg2.availabilityDisplayName}
                      </span>
                      {baseFare2 > 0 && (
                        <span className="ml-1 text-slate-500">
                          ₹{baseFare2}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Class Selection Buttons */}
                  {commonClasses.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1">
                        Select Class:
                      </span>
                      {commonClasses.map((cls) => (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => {
                            setSelectedClass(cls);
                            setCombinedResult(null);
                          }}
                          className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-all ${
                            selectedClass === cls
                              ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Section: Price, Status, CTA Action (Skyscanner Style) */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
            {/* Both Confirmed State (either initially or via scan) */}
            {isBothConfirmed && !loading && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                    ₹{displayFare}
                  </p>
                  <p className="max-w-[160px] truncate text-xs font-semibold text-emerald-600 sm:max-w-none">
                    {combinedResult?.confirmedCount
                      ? `🎉 ${combinedResult.confirmedCount} Seats Confirmed`
                      : `Both Legs Confirmed (${selectedClass})`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPopupOrBooking();
                  }}
                  className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
                >
                  Book Now
                </button>
              </>
            )}

            {/* Active Scanning State with Percentage of Completion */}
            {loading && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                    From ₹{displayFare}
                  </p>
                  <div className="mt-0.5 flex items-center justify-start gap-1 md:justify-end">
                    <span className="font-mono text-xs font-bold text-blue-600">
                      {scanProgress}%
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-600 sm:px-4 sm:text-sm"
                >
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span>{scanProgress}%</span>
                </button>
              </>
            )}

            {/* Scan Finished without full confirmation */}
            {!isBothConfirmed && !loading && combinedResult && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                    From ₹{displayFare}
                  </p>
                  <p className="max-w-[160px] truncate text-xs font-medium text-amber-700 sm:max-w-none">
                    {combinedResult.summary || "Partial Waitlist"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void executeScan();
                    }}
                    className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Re-scan
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPopupOrBooking();
                    }}
                    className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    Book
                  </button>
                </div>
              </>
            )}

            {/* Idle / Unverified State: Show "Find Tickets" CTA */}
            {!isBothConfirmed && !loading && !combinedResult && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                    From ₹{displayFare}
                  </p>
                  <p className="max-w-[160px] truncate text-[11px] font-medium text-slate-500 sm:max-w-none">
                    Class {selectedClass}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void executeScan();
                  }}
                  className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
                >
                  Find Tickets
                </button>
              </>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void executeScan();
                  }}
                  className="font-bold underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </li>

      {isSplitBookingEnabled && bookingRequest && (
        <SplitTicketBookingFlow
          {...bookingRequest}
          onClose={() => setBookingRequest(null)}
        />
      )}
    </>
  );
});
