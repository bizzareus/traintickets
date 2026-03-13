"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

type Request = {
  id: string;
  trainId: string;
  stationCode: string;
  journeyDate: string;
  classCode: string;
  status: string;
  train: { trainNumber: string; trainName: string };
  executions?: Execution[];
  alertLogs?: AlertLog[];
};
type Execution = {
  id: string;
  status: string;
  resultPayload: unknown;
  createdAt: string;
  completedAt: string | null;
};
type AlertLog = {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
};

export default function MonitoringDetailPage() {
  const params = useParams();
  const [request, setRequest] = useState<Request | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    apiClient
      .get<Request>(`/api/monitoring-requests/${id}`)
      .then((r) => {
        const data = r.data;
        setRequest(data);
        setExecutions(data.executions ?? []);
        setAlertLogs(data.alertLogs ?? []);
      })
      .catch(() => setRequest(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading || !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">{request === null && !loading ? "Not found" : "Loading…"}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold text-primary">RailChart</Link>
          <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">← Dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900">{request.train.trainName} ({request.train.trainNumber})</h1>
          <p className="text-slate-600">{request.stationCode} · {request.classCode} · {new Date(request.journeyDate).toLocaleDateString()}</p>
          <p className="mt-2">
            Status: <span className="font-medium">{request.status}</span>
          </p>
        </div>

        {executions.length > 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow">
            <h2 className="text-lg font-semibold text-slate-900">Execution history</h2>
            <ul className="mt-4 space-y-3">
              {executions.map((ex) => (
                <li key={ex.id} className="rounded-lg border border-slate-100 p-4">
                  <p className="text-sm font-medium text-slate-700">Status: {ex.status}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(ex.createdAt).toLocaleString()} — {ex.completedAt ? new Date(ex.completedAt).toLocaleString() : "—"}
                  </p>
                  {ex.resultPayload != null && (
                    <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(ex.resultPayload, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {alertLogs.length > 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow">
            <h2 className="text-lg font-semibold text-slate-900">Alert logs</h2>
            <ul className="mt-4 space-y-2">
              {alertLogs.map((log) => (
                <li key={log.id} className="flex justify-between text-sm">
                  <span>{log.channel}</span>
                  <span className={log.status === "sent" ? "text-green-600" : "text-red-600"}>{log.status}</span>
                  <span className="text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
