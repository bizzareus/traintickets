"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

type Train = {
  id: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  departureTime: string | null;
  arrivalTime: string | null;
  active: boolean;
  chartRules: { stationCode: string; chartTimeLocal: string }[];
};

export default function AdminTrainsPage() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<Train[]>("/api/admin/trains")
      .then((r) => setTrains(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTrains([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-600">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Trains</h1>
      <p className="mt-1 text-slate-600">All trains and their chart rules.</p>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">Number</th>
              <th className="px-4 py-3 font-medium text-slate-700">Name</th>
              <th className="px-4 py-3 font-medium text-slate-700">Route</th>
              <th className="px-4 py-3 font-medium text-slate-700">Chart times</th>
              <th className="px-4 py-3 font-medium text-slate-700">Active</th>
            </tr>
          </thead>
          <tbody>
            {trains.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{t.trainNumber}</td>
                <td className="px-4 py-3">{t.trainName}</td>
                <td className="px-4 py-3">{t.originStation} → {t.destinationStation}</td>
                <td className="px-4 py-3">
                  {t.chartRules.map((r) => `${r.stationCode} @ ${r.chartTimeLocal}`).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">{t.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
