"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

type Instance = {
  id: string;
  trainId: string;
  stationCode: string;
  journeyDate: string;
  chartTimestamp: string;
  sequenceNumber: number;
  executed: boolean;
  executedAt: string | null;
  train: { trainNumber: string; trainName: string };
};

export default function AdminInstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<Instance[]>("/api/admin/chart-event-instances", { params: { limit: 100 } })
      .then((r) => setInstances(Array.isArray(r.data) ? r.data : []))
      .catch(() => setInstances([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-600">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chart event instances</h1>
      <p className="mt-1 text-slate-600">Generated per journey date; cron processes when chart_timestamp is due.</p>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">Train</th>
              <th className="px-4 py-3 font-medium text-slate-700">Station</th>
              <th className="px-4 py-3 font-medium text-slate-700">Journey date</th>
              <th className="px-4 py-3 font-medium text-slate-700">Chart timestamp</th>
              <th className="px-4 py-3 font-medium text-slate-700">Executed</th>
              <th className="px-4 py-3 font-medium text-slate-700">Executed at</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{i.train.trainNumber}</td>
                <td className="px-4 py-3">{i.stationCode}</td>
                <td className="px-4 py-3">{new Date(i.journeyDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">{new Date(i.chartTimestamp).toLocaleString()}</td>
                <td className="px-4 py-3">{i.executed ? "Yes" : "No"}</td>
                <td className="px-4 py-3">{i.executedAt ? new Date(i.executedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
