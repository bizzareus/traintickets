"use client";

import { useState, useEffect } from "react";

type Execution = {
  id: string;
  jobId: string | null;
  status: string;
  resultPayload: unknown;
  createdAt: string;
  completedAt: string | null;
  monitoringRequest: {
    train: { trainNumber: string; trainName: string };
    stationCode: string;
    journeyDate: string;
  };
};

export default function AdminExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3009";
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`${apiUrl}/api/admin/executions?limit=100`, { headers })
      .then((r) => r.json())
      .then((data) => setExecutions(Array.isArray(data) ? data : []))
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-600">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Browser executions</h1>
      <p className="mt-1 text-slate-600">Availability checks triggered by the cron at chart time.</p>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">Train</th>
              <th className="px-4 py-3 font-medium text-slate-700">Station / Date</th>
              <th className="px-4 py-3 font-medium text-slate-700">Status</th>
              <th className="px-4 py-3 font-medium text-slate-700">Created</th>
              <th className="px-4 py-3 font-medium text-slate-700">Completed</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((ex) => (
              <tr key={ex.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{ex.monitoringRequest?.train?.trainNumber} – {ex.monitoringRequest?.train?.trainName}</td>
                <td className="px-4 py-3">{ex.monitoringRequest?.stationCode} · {ex.monitoringRequest?.journeyDate ? new Date(ex.monitoringRequest.journeyDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">{ex.status}</td>
                <td className="px-4 py-3">{new Date(ex.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{ex.completedAt ? new Date(ex.completedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
