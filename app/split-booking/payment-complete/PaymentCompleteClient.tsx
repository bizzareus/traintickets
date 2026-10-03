"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchSplitBookingStatus,
  type SplitBookingStatus,
} from "@/lib/split-booking";

export function PaymentCompleteClient({ bookingRef }: { bookingRef: string }) {
  const [booking, setBooking] = useState<SplitBookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingRef) return;
    let active = true;
    const check = async () => {
      try {
        const status = await fetchSplitBookingStatus(bookingRef);
        if (!active) return;
        setBooking(status);
        setError(null);
        if (status.paymentStatus !== "PENDING") clearInterval(timer);
      } catch {
        if (active) setError("Could not check your payment yet. Retrying…");
      }
    };
    const timer = setInterval(() => void check(), 3000);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bookingRef]);

  const paid = booking?.paymentStatus === "PAID";
  const failed = booking?.paymentStatus === "FAILED";
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-2xl font-bold text-slate-900">
        {!bookingRef
          ? "Missing booking reference"
          : paid ? "Payment received"
          : failed ? "Payment failed"
          : "Confirming your payment"}
      </h1>
      {bookingRef && (
        <p className="text-sm text-slate-600">Booking Ref: {bookingRef}</p>
      )}
      {booking && (
        <p className="text-sm text-slate-600">
          ₹{booking.totalFare.toLocaleString("en-IN")} (tickets) + ₹
          {booking.serviceFee.toLocaleString("en-IN")} (payment service charge) = ₹
          {booking.amount.toLocaleString("en-IN")}
        </p>
      )}
      <p role="status" className="text-sm text-slate-600">
        {paid
          ? "Your payment is confirmed. Check the reservation window for booking progress and PNRs. Payment alone does not confirm a ticket."
          : failed
            ? "Your reservation has not started. Return to LastBerth to try again."
            : error ?? (bookingRef
                ? "Waiting for confirmation from the payment provider…"
                : "Open the payment link from your reservation to continue.")}
      </p>
      <Link
        href="/"
        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Return to LastBerth
      </Link>
    </main>
  );
}
