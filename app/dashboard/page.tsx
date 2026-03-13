"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

type Request = {
  id: string;
  trainId: string;
  stationCode: string;
  journeyDate: string;
  classCode: string;
  status: string;
  createdAt: string;
  train: { trainNumber: string; trainName: string };
  chartTimestamp: string | null;
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" });
}
function formatDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export default function DashboardPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ user?: { id: string; name: string; email: string } }>("/api/auth/me")
      .then((r) => {
        const data = r.data;
        setUser(data.user ?? null);
        if (!data.user) return [] as Request[];
        return apiClient.get<Request[]>("/api/monitoring-requests").then((res) => res.data);
      })
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600">Sign in to view your dashboard.</p>
          <Link href="/login" className="mt-4 inline-block rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground">Sign in</Link>
        </div>
      </div>
    );
  }

  const statusStyle: Record<string, string> = {
    scheduled: "bg-amber-100 text-amber-800",
    completed: "bg-green-100 text-green-800",
    expired: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold text-primary">RailChart</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.email}</span>
            <Link href="/search" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Search trains</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-900">Your monitoring requests</h1>
        <p className="mt-1 text-slate-600">We&apos;ll check at chart time and alert you if seats are available.</p>

        {requests.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
            No monitoring requests yet.{" "}
            <Link href="/search" className="font-medium text-primary hover:underline">Search trains</Link> and click &quot;Get Instant Alert&quot;.
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {requests.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {req.train.trainName} ({req.train.trainNumber})
                    </h2>
                    <p className="text-slate-600">
                      {req.stationCode} · {req.classCode} · {formatDate(req.journeyDate)}
                    </p>
                    {req.chartTimestamp && (
                      <p className="mt-1 text-sm text-slate-500">Chart at {formatDateTime(req.chartTimestamp)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-3 py-1 text-sm font-medium ${statusStyle[req.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {req.status}
                    </span>
                    <Link
                      href={`/dashboard/${req.id}`}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
