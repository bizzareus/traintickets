"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { VisualCoachMap, type VacantBerth } from "@/components/VisualCoachMap";

type Task = {
  id: string;
  stationCode: string;
  chartAt: string;
  status: string;
  resultPayload: {
    chartPreparationDetails?: {
      firstChartCreationTime: string;
      chartingStationCode: string;
      chartingStationName: string;
      journeyDate: string;
    };
    vacantBerths?: VacantBerth[];
  } | null;
  completedAt: string | null;
  trainNumber?: string;
  trainName?: string | null;
  fromStationCode?: string;
  toStationCode?: string;
  journeyDate?: string;
};

type JourneyResponse = {
  journeyRequestId: string;
  tasks: Task[];
};

export default function MonitoringDetailPage() {
  const params = useParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journeyRequestId, setJourneyRequestId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params.id as string;
    apiClient
      .get<JourneyResponse>(`/api/availability/journey/${id}`)
      .then((r) => {
        setJourneyRequestId(r.data.journeyRequestId);
        setTasks(r.data.tasks ?? []);
      })
      .catch((err) => {
        console.error("Failed to load journey tasks", err);
        setError("Monitoring request not found or failed to load details.");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm font-semibold text-slate-600">Loading monitoring details…</p>
        </div>
      </div>
    );
  }

  if (error || tasks.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md shadow-sm">
          <span className="text-4xl">🔍</span>
          <h2 className="mt-4 text-lg font-bold text-slate-800">Not Found</h2>
          <p className="mt-2 text-sm text-slate-500">{error || "No active monitoring tasks found for this request."}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const firstTask = tasks[0];
  const trainNumber = firstTask?.trainNumber || "";
  const trainName = firstTask?.trainName || "Unknown Train";
  const fromStation = firstTask?.fromStationCode || "";
  const toStation = firstTask?.toStationCode || "";
  const journeyDateRaw = firstTask?.journeyDate || "";
  const journeyDateFormatted = journeyDateRaw
    ? new Date(journeyDateRaw).toLocaleDateString("en-IN", { dateStyle: "medium" })
    : "";

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-extrabold text-blue-600 tracking-tight">
            LastBerth <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">PRO</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* Meta Info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-700 uppercase tracking-wide">
              Journey Monitor Request
            </span>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">
              {trainName} ({trainNumber})
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              Segment: <span className="font-bold text-slate-700">{fromStation}</span> → <span className="font-bold text-slate-700">{toStation}</span> · Date: <span className="font-bold text-slate-700">{journeyDateFormatted}</span>
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-xs font-semibold text-slate-400">Request ID</span>
            <code className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-xs font-mono font-bold text-slate-700">
              {journeyRequestId}
            </code>
          </div>
        </div>

        {/* Tasks Visualizer Section */}
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide">
            Monitoring Runs & Scraper Executions
          </h2>

          <div className="space-y-6">
            {tasks.map((task, idx) => {
              const vacantBerthsCount = task.resultPayload?.vacantBerths?.length ?? 0;

              return (
                <div
                  key={task.id}
                  className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  {/* Run Header */}
                  <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-800">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Charting station: {task.stationCode}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                          Scheduled: {new Date(task.chartAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          task.status === "completed"
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : task.status === "failed"
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-amber-100 text-amber-700 border border-amber-200 animate-pulse"
                        }`}
                      >
                        {task.status}
                      </span>
                      {task.completedAt && (
                        <span className="text-xs text-slate-400 font-medium">
                          Completed: {new Date(task.completedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Run Content / Visual Coach Map */}
                  <div className="p-6 space-y-4">
                    {task.status === "pending" ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                        <span className="text-2xl animate-bounce">⏳</span>
                        <p className="text-sm font-bold text-slate-700">Awaiting Chart Preparation Time</p>
                        <p className="text-xs text-slate-400 max-w-xs">
                          LastBerth will automatically run the IRCTC vacant berth scraper the moment this station prepares charts.
                        </p>
                      </div>
                    ) : task.status === "failed" ? (
                      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
                        <p className="text-sm font-bold text-red-800">Scraper run failed</p>
                        <p className="text-xs text-red-600 mt-1">
                          IRCTC was temporarily down, or the train composition was not available.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Summary metadata if available */}
                        {task.resultPayload?.chartPreparationDetails && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs font-medium text-slate-600">
                            <div>
                              <p className="text-slate-400">First Chart Created</p>
                              <p className="font-bold text-slate-800">
                                {task.resultPayload.chartPreparationDetails.firstChartCreationTime} IST
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Charting Station</p>
                              <p className="font-bold text-slate-800">
                                {task.resultPayload.chartPreparationDetails.chartingStationName} ({task.resultPayload.chartPreparationDetails.chartingStationCode})
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Total Vacant Seats</p>
                              <p className="font-bold text-slate-800 text-green-600">
                                {vacantBerthsCount} berths
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Scrape Status</p>
                              <p className="font-bold text-emerald-600">✓ Successful</p>
                            </div>
                          </div>
                        )}

                        {/* Interactive Visual Coach Map */}
                        <VisualCoachMap vacantBerths={task.resultPayload?.vacantBerths ?? []} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
