"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, Train, Calendar, ArrowRight, Phone, Mail } from "lucide-react";

export function SubscribeClient() {
  const searchParams = useSearchParams();

  const trainNo = searchParams.get("trainNo") || searchParams.get("trainNumber") || "";
  const trainName = searchParams.get("trainName") || "";
  const fromCode = (searchParams.get("from") || searchParams.get("fromStationCode") || "").toUpperCase();
  const toCode = (searchParams.get("to") || searchParams.get("toStationCode") || "").toUpperCase();
  const date = searchParams.get("date") || searchParams.get("journeyDate") || "";
  const travelClass = (searchParams.get("class") || searchParams.get("classCode") || "3A").toUpperCase();
  const email = searchParams.get("email") || "";
  const mobile = searchParams.get("mobile") || "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!trainNo || !fromCode || !toCode || !date) {
      setStatus("error");
      setErrorMessage("Missing required alert parameters (train number, stations, or date).");
      return;
    }

    let isMounted = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";

    async function subscribeAlert() {
      try {
        const response = await fetch(`${apiUrl}/api/availability/journey`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trainNumber: trainNo,
            trainName: trainName || undefined,
            fromStationCode: fromCode,
            toStationCode: toCode,
            journeyDate: date,
            classCode: travelClass,
            stationCodesToMonitor: [fromCode],
            email: email || undefined,
            mobile: mobile || undefined,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to set up chart preparation alert.");
        }

        if (isMounted) {
          setStatus("success");
        }
      } catch (err: unknown) {
        if (isMounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "An error occurred while creating your alert.");
        }
      }
    }

    subscribeAlert();

    return () => {
      isMounted = false;
    };
  }, [trainNo, trainName, fromCode, toCode, date, travelClass, email, mobile]);

  const formattedDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : date;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        {status === "loading" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
            <h2 className="mt-4 text-xl font-bold text-slate-900">Setting Up Your Chart Alert...</h2>
            <p className="mt-2 text-sm text-slate-600">
              Subscribing you to chart preparation alerts for Train {trainNo}...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Subscription Notice</h2>
            <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href={`/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Search Trains on LastBerth
              </Link>
            </div>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Alert Subscribed! 🔔</h1>
              <p className="mt-1.5 text-sm text-slate-600">
                You will receive a WhatsApp & Email notification as soon as chart preparation completes.
              </p>
            </div>

            <div className="mt-6 space-y-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Train className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div>
                  <span className="font-semibold text-slate-900">
                    {trainNo} {trainName}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-700">
                    <span>{fromCode}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <span>{toCode}</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                      Class {travelClass}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="text-slate-700">{formattedDate}</span>
              </div>

              {(email || mobile) && (
                <div className="border-t border-slate-200/80 pt-3 space-y-2">
                  {mobile && (
                    <div className="flex items-center gap-3 text-slate-700">
                      <Phone className="h-4 w-4 text-emerald-600" />
                      <span>WhatsApp alert configured for <strong className="font-semibold text-slate-900">{mobile}</strong></span>
                    </div>
                  )}
                  {email && (
                    <div className="flex items-center gap-3 text-slate-700">
                      <Mail className="h-4 w-4 text-blue-600" />
                      <span>Email alert configured for <strong className="font-semibold text-slate-900">{email}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2.5 text-center">
              <Link
                href={`/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Explore Alternate Trains
              </Link>
              <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline">
                Return to LastBerth Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
