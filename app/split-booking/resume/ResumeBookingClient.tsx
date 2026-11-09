"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit2,
  Loader2,
  ShieldCheck,
  Train,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import {
  type SplitBookingLeg,
  type SplitBookingPassenger,
} from "@/lib/split-booking";
import { SplitTicketBookingModal } from "@/components/booking-v2/SplitTicketBookingModal";
import { formatLegDate, formatTimeAmPm } from "@/components/booking-v2/alternatePathHelpers";

interface BookingResumeResponse {
  id: string;
  bookingRef: string;
  trainNumber: string;
  trainName: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  quota: string;
  totalFare: number;
  serviceFee: number;
  irctcServiceFeePaise: number;
  paymentGatewayFeePaise: number;
  legs: SplitBookingLeg[];
  passengers: {
    adults: SplitBookingPassenger[];
    children?: Array<{ name: string; age: number; gender: string }>;
    confirmBerthsOnly?: boolean;
    preferredCoach?: string | null;
    travelInsurance?: boolean;
  };
  contactMobile: string;
  contactEmail: string;
  autoUpgrade: boolean;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  bookingStatus: string;
  payUrl: string | null;
  pnrs?: string[];
  createdAt: string;
}

export function ResumeBookingClient({ bookingRef }: { bookingRef: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingResumeResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!bookingRef?.trim()) {
      setError("No booking reference provided.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchBooking = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<BookingResumeResponse>(
          `/api/split-booking/resume/${encodeURIComponent(bookingRef.trim())}`,
        );
        if (!isMounted) return;
        setBooking(res.data);
        // Automatically open the booking panel if payment is still pending
        if (res.data.paymentStatus === "PENDING") {
          setModalOpen(true);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
        setError(msg || "Unable to find or restore this booking. It may have expired.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchBooking();
    return () => {
      isMounted = false;
    };
  }, [bookingRef]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <h2 className="text-base font-bold text-slate-800">
          Restoring your saved booking details…
        </h2>
        <p className="text-xs text-slate-500">
          Loading itinerary, passenger details, and seat availability.
        </p>
      </main>
    );
  }

  if (error || !booking) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <XCircle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Booking Not Found</h2>
          <p className="mt-1 text-sm text-slate-600">{error || "Could not retrieve booking."}</p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          Search Trains
        </Link>
      </main>
    );
  }

  const isPaid = booking.paymentStatus === "PAID";
  const primaryPassenger = booking.passengers?.adults?.[0];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header Banner */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Train className="h-4 w-4" />
            </span>
            <div>
              <span className="text-xs font-semibold text-slate-500">
                Booking Reference
              </span>
              <div className="font-mono text-sm font-bold text-slate-900">
                {booking.bookingRef}
              </div>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-bold sm:self-auto ${
              isPaid
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {isPaid ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Confirmed
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5 text-amber-600" /> Payment Pending
              </>
            )}
          </span>
        </div>

        <div className="p-4 sm:p-6">
          {isPaid ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  This Booking Is Already Confirmed!
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Payment for this reservation was completed. Your confirmed PNR and ticket details are available.
                </p>
              </div>
              <Link
                href={`/split-booking/payment-complete?ref=${encodeURIComponent(booking.bookingRef)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                View Confirmed Tickets <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Continue Your Reservation
                </span>
                <h1 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
                  {booking.trainName || `Train ${booking.trainNumber}`} ({booking.trainNumber})
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Route: <strong>{booking.fromStationCode}</strong> &rarr;{" "}
                  <strong>{booking.toStationCode}</strong> &middot; Class:{" "}
                  <strong>{booking.travelClass}</strong> ({booking.quota})
                </p>
              </div>

              {/* Saved Details Overview Card */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Saved Passenger Details
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    <Edit2 className="h-3 w-3" /> Edit Details
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-slate-500">Passenger:</span>
                    <p className="font-semibold text-slate-900">
                      {primaryPassenger?.name || "Passenger"} ({primaryPassenger?.age || 30} yrs, {primaryPassenger?.gender || "Male"})
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Berth Preference:</span>
                    <p className="font-semibold text-slate-900">
                      {primaryPassenger?.berthPreference || "No Preference"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Mobile Number:</span>
                    <p className="font-semibold text-slate-900">
                      {booking.contactMobile}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Email Address:</span>
                    <p className="font-semibold text-slate-900">
                      {booking.contactEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* Legs Breakdown */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">
                  Confirmed Split Legs ({booking.legs.length} {booking.legs.length === 1 ? "ticket" : "tickets"})
                </span>
                <div className="space-y-2">
                  {booking.legs.map((leg, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-700">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900">
                            {leg.from} &rarr; {leg.to}
                          </p>
                          <p className="text-xs text-slate-500">
                            Class: {leg.travelClass}
                            {leg.boardingDate ? ` · ${formatLegDate(leg.boardingDate)}` : ""}
                            {leg.departureTime ? ` · ${formatTimeAmPm(leg.departureTime)}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold tabular-nums text-slate-900">
                        ₹{leg.fare.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price & CTA */}
              <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs text-slate-600">Total Payable Fare:</span>
                  <div className="text-2xl font-black text-blue-700">
                    ₹{booking.totalFare.toLocaleString("en-IN")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  Open Booking & Pay Now <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Trust Badge */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Live seat availability from IRCTC</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Split Ticket Booking Modal prefilled with restored data */}
      {modalOpen && (
        <SplitTicketBookingModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          trainNumber={booking.trainNumber}
          trainName={booking.trainName ?? undefined}
          journeyDate={booking.journeyDate}
          fromStationCode={booking.fromStationCode}
          toStationCode={booking.toStationCode}
          travelClass={booking.travelClass}
          quota={booking.quota}
          totalFare={booking.totalFare}
          legs={(booking.legs || []).map((l) => ({
            from: l.from,
            to: l.to,
            travelClass: l.travelClass,
            boardingDate: l.boardingDate,
            fare: l.fare,
          }))}
          initialPassenger={primaryPassenger}
          initialMobile={booking.contactMobile}
          initialEmail={booking.contactEmail}
          initialAutoUpgrade={booking.autoUpgrade}
          initialConfirmBerthsOnly={booking.passengers?.confirmBerthsOnly}
          initialPreferredCoach={booking.passengers?.preferredCoach ?? undefined}
          initialTravelInsurance={booking.passengers?.travelInsurance}
          existingBookingRef={booking.bookingRef}
          existingPayUrl={booking.payUrl}
        />
      )}
    </main>
  );
}
