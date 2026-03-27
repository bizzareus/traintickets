"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";

const CLASSES = ["1A", "2A", "3A", "SL", "CC", "EC"];

type Train = {
  id: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  chartRules: { stationCode: string; chartTimeLocal: string; sequenceNumber: number }[];
};

function TrainDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const journeyDate = searchParams.get("journeyDate") ?? "";
  const [train, setTrain] = useState<Train | null>(null);
  const [classCode, setClassCode] = useState("3A");
  const [stationCode, setStationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .get<Train>(`/api/trains/${params.id}`)
      .then((r) => {
        const data = r.data;
        setTrain(data);
        if (data?.chartRules?.[0]) setStationCode(data.chartRules[0].stationCode);
      })
      .catch(() => setTrain(null));
  }, [params.id]);

  async function handleGetAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!train || !journeyDate || !stationCode) return;
    setLoading(true);
    setError("");
    try {
      await apiClient.post("/api/monitoring-requests", {
        trainId: train.id,
        stationCode,
        journeyDate,
        classCode,
      });
      setSuccess(true);
      trackAnalyticsEvent({
        name: "monitoring_alert_requested",
        properties: { success: true, train_id_present: true },
      });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      setError(ax.response?.data?.message ?? ax.response?.data?.error ?? "Request failed");
      trackAnalyticsEvent({
        name: "monitoring_alert_requested",
        properties: { success: false, train_id_present: Boolean(train) },
      });
    } finally {
      setLoading(false);
    }
  }

  if (!train) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold text-primary">LastBerth</Link>
          <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">Dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <Link href="/search" className="text-sm text-primary hover:underline">← Back to search</Link>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900">{train.trainName}</h1>
          <p className="text-slate-600">Train no. {train.trainNumber} · {train.originStation} → {train.destinationStation}</p>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900">Chart times</h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-slate-700">Station</th>
                    <th className="px-4 py-2 font-medium text-slate-700">Chart time</th>
                  </tr>
                </thead>
                <tbody>
                  {train.chartRules.map((r) => (
                    <tr key={r.stationCode} className="border-t border-slate-100">
                      <td className="px-4 py-2">{r.stationCode}</td>
                      <td className="px-4 py-2">{r.chartTimeLocal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {success ? (
            <div className="mt-8 rounded-lg bg-green-50 p-4 text-green-800">
              Monitoring request created. We&apos;ll check at chart time and alert you if seats are available. View in your{" "}
              <Link href="/dashboard" className="font-medium underline">Dashboard</Link>.
            </div>
          ) : (
            <form onSubmit={handleGetAlert} className="mt-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Station (chart)</label>
                <select
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {train.chartRules.map((r) => (
                    <option key={r.stationCode} value={r.stationCode}>
                      {r.stationCode} @ {r.chartTimeLocal}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Class</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CLASSES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClassCode(c)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        classCode === c
                          ? "bg-primary text-primary-foreground"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <input type="hidden" value={journeyDate} readOnly />
              {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              <button
                type="submit"
                disabled={loading || !journeyDate}
                className="w-full rounded-xl bg-primary py-4 text-lg font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl disabled:opacity-50"
              >
                {loading ? "Creating…" : "Get Instant Alert"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function TrainDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading…</div>}>
      <TrainDetailContent />
    </Suspense>
  );
}
