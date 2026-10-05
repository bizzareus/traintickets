"use client";

import { useId, useState } from "react";
import { ArrowRight, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import {
  buildSplitBookingSelection,
  getLegClassOptions,
  getSelectedLegClass,
  hasClassFare,
  type LegClassSelections,
} from "@/lib/splitBookingSelection";
import type { AlternateLeg } from "./alternatePathsTypes";
import { getStationDisplayName } from "./alternatePathHelpers";
import {
  SplitTicketBookingModal,
  type SplitTicketBookingModalProps,
} from "./SplitTicketBookingModal";

export interface SplitTicketBookingFlowProps {
  trainNumber: string;
  trainName?: string;
  journeyDate: string;
  legs: AlternateLeg[];
  stationNameMap?: Record<string, string>;
  onClose: () => void;
}

/** Class choices are made after Book Now, before collecting passenger details. */
export function SplitTicketBookingFlow({
  trainNumber,
  trainName,
  journeyDate,
  legs,
  stationNameMap,
  onClose,
}: SplitTicketBookingFlowProps) {
  const groupId = useId();
  const [choices, setChoices] = useState<LegClassSelections>({});
  const [details, setDetails] = useState<Omit<
    SplitTicketBookingModalProps,
    "open" | "onClose"
  > | null>(null);
  const selection = buildSplitBookingSelection(legs, choices);
  const hasMultipleClasses = legs.some(
    (leg) => getLegClassOptions(leg).length > 1,
  );
  const canContinue = selection.totalFare !== null && selection.legs.length > 1;
  const toBookingDetails = (): Omit<
    SplitTicketBookingModalProps,
    "open" | "onClose"
  > | null => {
    if (!canContinue || selection.totalFare === null) return null;
    const selectedLegs = selection.legs;
    return {
      trainNumber,
      trainName,
      journeyDate: selectedLegs[0].boardingDate || journeyDate,
      fromStationCode: selectedLegs[0].from,
      toStationCode: selectedLegs[selectedLegs.length - 1].to,
      travelClass: selectedLegs[0].travelClass,
      totalFare: selection.totalFare,
      legs: selectedLegs,
    };
  };
  const bookingDetails =
    details ?? (!hasMultipleClasses ? toBookingDetails() : null);

  if (bookingDetails) {
    return (
      <SplitTicketBookingModal {...bookingDetails} open onClose={onClose} />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${groupId}-title`}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[85vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:px-6">
          <div>
            <h3
              id={`${groupId}-title`}
              className="text-lg font-bold text-slate-900"
            >
              Choose classes for your tickets
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {trainName || "Train"} ({trainNumber}) · {journeyDate}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close class selection"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setDetails(toBookingDetails());
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
            <p className="text-sm text-slate-600">
              Select one class for each available ticket. Single-class tickets
              are already selected.
            </p>
            {legs.some((leg) => leg.segmentKind !== "confirmed") && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Only the available tickets below are included. Unavailable
                journey segments are not reserved.
              </p>
            )}
            {legs.map((leg, index) => {
              if (leg.segmentKind !== "confirmed") return null;
              const options = getLegClassOptions(leg);
              const selectedOption = getSelectedLegClass(leg, choices[index]);
              return (
                <fieldset
                  key={index}
                  className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4"
                >
                  <legend className="max-w-full px-1 text-sm font-bold text-slate-900">
                    Leg {index + 1}:{" "}
                    {getStationDisplayName(leg.from, stationNameMap)} →{" "}
                    {getStationDisplayName(leg.to, stationNameMap)}
                  </legend>
                  <p className="mb-3 text-xs text-slate-500">
                    Boarding date: {leg.boardingDate || journeyDate}
                  </p>
                  <div className="space-y-2">
                    {options.map((option) => {
                      const selected =
                        selectedOption?.travelClass === option.travelClass;
                      const priced = hasClassFare(option);
                      return (
                        <label
                          key={option.travelClass}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm",
                            !priced
                              ? "cursor-not-allowed border-slate-200 text-slate-400"
                              : selected
                                ? "cursor-pointer border-blue-600 bg-blue-50 text-slate-900"
                                : "cursor-pointer border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-slate-50",
                          )}
                        >
                          <input
                            type="radio"
                            name={`${groupId}-leg-${index}`}
                            aria-label={`Leg ${index + 1}: ${option.travelClass}, ${priced ? `₹${option.fare}` : "fare unavailable"}`}
                            checked={selected}
                            disabled={!priced}
                            onChange={() => {
                              trackAnalyticsEvent({
                                name: "split_booking_class_selected",
                                properties: {
                                  train_number: trainNumber,
                                  leg_index: index,
                                  from_code: leg.from,
                                  to_code: leg.to,
                                  travel_class: option.travelClass,
                                  fare: option.fare ?? null,
                                },
                              });
                              setChoices((current) => ({
                                ...current,
                                [index]: option.travelClass,
                              }));
                            }}
                            className="h-4 w-4 shrink-0 text-blue-600 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-bold">
                              {option.travelClass}
                            </span>
                            <span className="ml-2 text-xs text-emerald-700">
                              {option.availabilityDisplayName ||
                                option.railDataStatus ||
                                "Available"}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {priced
                              ? `₹${option.fare.toLocaleString("en-IN")}`
                              : "Fare unavailable"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div
              role="status"
              aria-label="Selected ticket fare"
              className="text-sm text-slate-600"
            >
              {selection.totalFare === null ? (
                "Choose a priced class for every ticket to continue."
              ) : (
                <>
                  Ticket fare:{" "}
                  <strong className="text-lg text-slate-900 tabular-nums">
                    ₹{selection.totalFare.toLocaleString("en-IN")}
                  </strong>
                </>
              )}
            </div>
            <button
              type="submit"
              disabled={!canContinue}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to passenger details <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Official IRCTC Agent Trust Strip */}
        <div className="border-t border-slate-100 bg-slate-50/90 px-3.5 py-2 sm:px-5 sm:py-2.5">
          <div className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-slate-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>LastBerth is an official IRCTC Agent</span>
          </div>
        </div>
      </div>
    </div>
  );
}
