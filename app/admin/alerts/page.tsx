"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import moment from "moment";

type Alert = {
  id: string;
  journeyRequestId: string;
  trainNumber: string;
  trainName: string | null;
  fromStationCode: string;
  toStationCode: string;
  stationCode: string; // The specific station being monitored for charting
  journeyDate: string;
  classCode: string;
  chartAt: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  emailNotifiedAt: string | null;
  whatsappNotifiedAt: string | null;
  contact: {
    email: string | null;
    mobile: string | null;
  } | null;
};

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    try {
      setLoading(true);
      const res = await apiClient.get<{ alerts: Alert[] }>("/api/availability/admin/alerts");
      setAlerts(res.data.alerts);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
      setError("Failed to load alerts. Please check if you are authorized.");
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "failed":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "running":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">
            History of all monitoring tasks setup by users.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm text-slate-500">Loading alerts...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
          <p>{error}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-900">Setup At</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Contact</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Train</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Journey</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Monitor Station</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Email</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      No alerts have been setup yet.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr key={alert.id} className="transition hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {moment(alert.createdAt).format("DD MMM, HH:mm")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          {alert.contact?.email && (
                            <span className="font-medium text-slate-900">{alert.contact.email}</span>
                          )}
                          {alert.contact?.mobile && (
                            <span className="text-xs text-slate-500">{alert.contact.mobile}</span>
                          )}
                          {!alert.contact?.email && !alert.contact?.mobile && (
                            <span className="italic text-slate-400">Anonymous</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-900">{alert.trainNumber}</span>
                          <span className="max-w-[150px] truncate text-xs text-slate-500" title={alert.trainName || ""}>
                            {alert.trainName || "Unknown Train"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-medium text-slate-900">
                            {moment(alert.journeyDate).format("DD MMM YYYY")}
                          </span>
                          <span>{alert.fromStationCode} → {alert.toStationCode} ({alert.classCode})</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-900">{alert.stationCode}</span>
                          <span className="text-xs text-slate-500">
                             at {moment(alert.chartAt).format("DD MMM, HH:mm")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${getStatusColor(
                            alert.status
                          )}`}
                        >
                          {alert.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {alert.emailNotifiedAt ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-emerald-600">Yes</span>
                            <span className="text-[10px] text-slate-400">{moment(alert.emailNotifiedAt).format("HH:mm, DD MMM")}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {alert.whatsappNotifiedAt ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-emerald-600">Yes</span>
                            <span className="text-[10px] text-slate-400">{moment(alert.whatsappNotifiedAt).format("HH:mm, DD MMM")}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">No</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
