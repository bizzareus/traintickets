"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

type ChartRule = {
  id: string;
  trainId: string;
  stationCode: string;
  chartTimeLocal: string;
  sequenceNumber: number;
  active: boolean;
  train: { trainNumber: string; trainName: string };
};

export default function AdminChartRulesPage() {
  const [rules, setRules] = useState<ChartRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<ChartRule[]>("/api/admin/chart-rules")
      .then((r) => setRules(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-600">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chart rules</h1>
      <p className="mt-1 text-slate-600">Chart preparation times per train and station.</p>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">Train</th>
              <th className="px-4 py-3 font-medium text-slate-700">Station</th>
              <th className="px-4 py-3 font-medium text-slate-700">Chart time (local)</th>
              <th className="px-4 py-3 font-medium text-slate-700">Sequence</th>
              <th className="px-4 py-3 font-medium text-slate-700">Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{r.train.trainNumber} – {r.train.trainName}</td>
                <td className="px-4 py-3">{r.stationCode}</td>
                <td className="px-4 py-3">{r.chartTimeLocal}</td>
                <td className="px-4 py-3">{r.sequenceNumber}</td>
                <td className="px-4 py-3">{r.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
