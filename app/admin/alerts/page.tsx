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
  firstRunAt: string | null;
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
  const [nowIst, setNowIst] = useState("");
  const [sortField, setSortField] = useState<"createdAt" | "chartAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const update = () => {
      setNowIst(moment().utcOffset("+05:30").format("DD MMM, HH:mm:ss") + " IST");
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

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

  async function triggerAlert(id: string) {
    if (!confirm("Are you sure you want to trigger this alert?")) return;
    try {
      await apiClient.post(`/api/availability/admin/alerts/${id}/trigger`);
      fetchAlerts();
    } catch (err) {
      console.error("Failed to trigger alert", err);
      alert("Failed to trigger alert");
    }
  }

  const sortedAlerts = [...alerts].sort((a, b) => {
    const valA = new Date(a[sortField]).getTime();
    const valB = new Date(b[sortField]).getTime();
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });

  const toggleSort = (field: "createdAt" | "chartAt") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

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

  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<string | null>(null);

  async function resendFailedAlerts() {
    if (!confirm("Are you sure you want to resend notifications for all alerts that failed or were unsent in the last 24 hours?")) return;
    try {
      setResending(true);
      setResendResult(null);
      const res = await apiClient.post<{ found: number; resent: number; failed: number }>(
        "/api/availability/admin/resend-failed-notifications?hours=24"
      );
      setResendResult(`Batch resend finished: ${res.data.resent} sent successfully out of ${res.data.found} found (${res.data.failed} failed).`);
      fetchAlerts();
    } catch (err) {
      console.error("Failed to resend alerts", err);
      alert("Failed to execute resend for last 24 hours.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Alerts</h1>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-slate-500">
              History of all monitoring tasks setup by users.
            </p>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Current: {nowIst}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resendFailedAlerts}
            disabled={resending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {resending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Resending...
              </>
            ) : (
              <span>Resend Failed Alerts (Last 24h)</span>
            )}
          </button>
          <button
            onClick={fetchAlerts}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {resendResult && (
        <div className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-medium text-indigo-900">
          <span>{resendResult}</span>
          <button onClick={() => setResendResult(null)} className="text-xs font-semibold text-indigo-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

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
                  <th
                    className="cursor-pointer px-6 py-4 font-semibold text-slate-900 transition hover:bg-slate-100"
                    onClick={() => toggleSort("createdAt")}
                  >
                    <div className="flex items-center gap-2">
                      Setup At (BST)
                      {sortField === "createdAt" && (
                        <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Contact</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Train</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Journey</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Monitor Station</th>
                  <th
                    className="cursor-pointer px-6 py-4 font-semibold text-slate-900 transition hover:bg-slate-100"
                    onClick={() => toggleSort("chartAt")}
                  >
                    <div className="flex items-center gap-2">
                      Trigger At (IST)
                      {sortField === "chartAt" && (
                        <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Status / Run Info</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">First Run / Delay</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Email</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">WhatsApp</th>
                  <th className="px-6 py-4 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                      No alerts have been setup yet.
                    </td>
                  </tr>
                ) : (
                  sortedAlerts.map((alert) => (
                    <tr key={alert.id} className="transition hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {moment.utc(alert.createdAt).utcOffset("+01:00").format("DD MMM, HH:mm")}
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
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5 font-medium text-slate-700 uppercase leading-tight">
                          <span>{moment.utc(alert.chartAt).utcOffset("+05:30").format("DD MMM, HH:mm")}</span>
                          {alert.status === "pending" && (
                            <span className="text-[10px] font-normal lowercase text-slate-400">
                              ({moment(alert.chartAt).fromNow(true)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${getStatusColor(
                              alert.status
                            )}`}
                          >
                            {alert.status.toUpperCase()}
                          </span>
                          {alert.completedAt && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              Ran at: {moment.utc(alert.completedAt).utcOffset("+05:30").format("HH:mm:ss")}
                            </span>
                          )}
                          {alert.completedAt && moment(alert.completedAt).diff(moment(alert.chartAt), 'minutes') > 10 && (
                            <span className="text-[10px] text-rose-500 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                              {moment(alert.completedAt).diff(moment(alert.chartAt), 'minutes')}m Late
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {alert.firstRunAt ? (
                          <div className="flex flex-col items-start gap-1 text-xs">
                            <span className="font-semibold text-slate-900 leading-tight">
                              {moment.utc(alert.firstRunAt).utcOffset("+05:30").format("DD MMM, HH:mm:ss")}
                            </span>
                            {(() => {
                              const diffMs = moment(alert.firstRunAt).diff(moment(alert.chartAt));
                              const diffSecsTotal = Math.floor(diffMs / 1000);
                              const isLate = diffSecsTotal > 0;
                              const absSecsTotal = Math.abs(diffSecsTotal);
                              const diffMins = Math.floor(absSecsTotal / 60);
                              const diffSecs = absSecsTotal % 60;
                              return (
                                <span className={`font-semibold text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none inline-flex items-center mt-1 ${
                                  isLate 
                                    ? 'text-rose-600 bg-rose-50 border-rose-100' 
                                    : 'text-emerald-600 bg-emerald-50 border-emerald-100'
                                }`}>
                                  {isLate ? 'Late ' : 'Early '}
                                  {diffMins}m {diffSecs}s
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {alert.emailNotifiedAt ? (
                          <span className="text-xs text-slate-600">
                            {moment(alert.emailNotifiedAt).format("DD MMM, HH:mm")}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {alert.whatsappNotifiedAt ? (
                          <span className="text-xs text-slate-600">
                            {moment(alert.whatsappNotifiedAt).format("DD MMM, HH:mm")}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(alert.status === "failed" ||
                          (alert.status === "pending" && moment().isAfter(moment(alert.chartAt)))) && (
                          <button
                            onClick={() => triggerAlert(alert.id)}
                            className="rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                          >
                            Trigger
                          </button>
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
