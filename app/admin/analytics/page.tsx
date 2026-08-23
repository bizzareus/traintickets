"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { apiClient } from "@/lib/api";
import moment from "moment";

type DailyStat = {
  date: string;
  totalNotificationsCreated: number;
  uniqueUsers: number;
  uniqueTrainsMonitored: number;
  dayOnDayChange: number | null;
  growthPercentageDoD: number | null;
};

type AnalyticsSummary = {
  totalNotifications: number;
  totalDays: number;
  avgPerDay: number;
  peakDay: { date: string; count: number } | null;
};

type AnalyticsResponse = {
  dailyStats: DailyStat[];
  summary: AnalyticsSummary;
};

export default function NotificationsAnalyticsPage() {
  const [data, setData] = useState<DailyStat[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range controls
  const [preset, setPreset] = useState<"7d" | "14d" | "30d" | "90d" | "all" | "custom">("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Hovered bar state for chart tooltips
  const [hoveredBar, setHoveredBar] = useState<DailyStat | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Compute date range parameters based on preset
  useEffect(() => {
    if (preset === "custom") return;

    const end = moment().format("YYYY-MM-DD");
    let start = "";

    if (preset === "7d") {
      start = moment().subtract(6, "days").format("YYYY-MM-DD");
    } else if (preset === "14d") {
      start = moment().subtract(13, "days").format("YYYY-MM-DD");
    } else if (preset === "30d") {
      start = moment().subtract(29, "days").format("YYYY-MM-DD");
    } else if (preset === "90d") {
      start = moment().subtract(89, "days").format("YYYY-MM-DD");
    } else if (preset === "all") {
      start = "";
    }

    setStartDate(start);
    setEndDate(start ? end : "");
  }, [preset]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient.get<AnalyticsResponse>(
        `/api/availability/admin/notifications-analytics${queryStr}`
      );

      setData(res.data.dailyStats || []);
      setSummary(res.data.summary || null);
      setError(null);
    } catch (err: unknown) {
      console.error("Failed to fetch notification analytics", err);
      const isNetworkErr =
        err && typeof err === "object" && "code" in err && err.code === "ERR_NETWORK";
      setError(
        isNetworkErr
          ? "Network Error: Unable to connect to backend server. Please ensure the API service is running."
          : "Failed to load analytics data from server."
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Calculate chart max height & scale
  const maxVal = useMemo(() => {
    if (!data.length) return 10;
    const max = Math.max(...data.map((d) => d.totalNotificationsCreated));
    return max === 0 ? 10 : Math.ceil(max * 1.15);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Day-on-day count of notifications & alerts created by users.
          </p>
        </div>

        {/* Date Range Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "14d", "30d", "90d", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                preset === p
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p === "7d" && "7 Days"}
              {p === "14d" && "14 Days"}
              {p === "30d" && "30 Days"}
              {p === "90d" && "90 Days"}
              {p === "all" && "All Time"}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium text-slate-600 shadow-sm">
        <span className="font-semibold text-slate-900">Date Range:</span>
        <div className="flex items-center gap-2">
          <label htmlFor="startDate">From:</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => {
              setPreset("custom");
              setStartDate(e.target.value);
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="endDate">To:</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => {
              setPreset("custom");
              setEndDate(e.target.value);
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => setPreset("all")}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Reset Range
          </button>
        )}
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Total Notifications</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalNotifications}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Daily Average</span>
            <p className="mt-1 text-2xl font-bold text-indigo-600">{summary.avgPerDay}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Peak Single Day</span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {summary.peakDay ? summary.peakDay.count : 0}
            </p>
            {summary.peakDay && (
              <span className="text-[10px] text-slate-400">
                {moment(summary.peakDay.date).format("DD MMM YYYY")}
              </span>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Active Days</span>
            <p className="mt-1 text-2xl font-bold text-slate-800">{summary.totalDays}</p>
          </div>
        </div>
      )}

      {/* Main Bar Chart Section */}
      <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Day-on-Day Created Notifications</h2>
          <span className="text-xs text-slate-400">Hover over bars for details</span>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-rose-600 font-medium">{error}</p>
            <button
              onClick={fetchAnalytics}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Retry Connection
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            No notification data found for the selected date range.
          </div>
        ) : (
          <div className="relative">
            {/* SVG Bar Chart */}
            <div className="relative h-72 w-full overflow-x-auto">
              <div className="flex h-full min-w-full items-end gap-1.5 pt-8 pb-8">
                {data.map((item) => {
                  const heightPercent = Math.max(
                    4,
                    Math.round((item.totalNotificationsCreated / maxVal) * 100)
                  );
                  const isHovered = hoveredBar?.date === item.date;

                  return (
                    <div
                      key={item.date}
                      className="group relative flex flex-1 flex-col items-center h-full justify-end"
                      onMouseEnter={(e) => {
                        setHoveredBar(item);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => {
                        setHoveredBar(null);
                        setHoverPos(null);
                      }}
                    >
                      {/* Bar Value Top Label */}
                      <span
                        className={`mb-1 text-[10px] font-bold transition ${
                          isHovered ? "text-indigo-600 scale-110" : "text-slate-500"
                        }`}
                      >
                        {item.totalNotificationsCreated}
                      </span>

                      {/* Bar Container */}
                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[28px] rounded-t-md transition-all duration-200 ${
                            isHovered
                              ? "bg-indigo-600 shadow-md"
                              : "bg-indigo-500/85 hover:bg-indigo-600"
                          }`}
                        />
                      </div>

                      {/* X Axis Label */}
                      <span className="mt-2 text-[10px] font-medium text-slate-400 group-hover:text-slate-700 whitespace-nowrap">
                        {moment(item.date).format("DD MMM")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover Tooltip Popup */}
            {hoveredBar && hoverPos && (
              <div
                className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-white shadow-xl transition-all"
                style={{ left: hoverPos.x, top: hoverPos.y }}
              >
                <div className="font-bold text-slate-200">
                  {moment(hoveredBar.date).format("ddd, DD MMM YYYY")}
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Notifications Created:</span>
                    <span className="font-bold text-indigo-400">
                      {hoveredBar.totalNotificationsCreated}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Unique Active Users:</span>
                    <span className="font-bold text-emerald-400">
                      {hoveredBar.uniqueUsers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Trains Monitored:</span>
                    <span className="font-bold text-amber-400">
                      {hoveredBar.uniqueTrainsMonitored}
                    </span>
                  </div>
                  {hoveredBar.dayOnDayChange !== null && (
                    <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-1">
                      <span className="text-slate-400">Day-on-Day Change:</span>
                      <span
                        className={`font-bold ${
                          hoveredBar.dayOnDayChange >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {hoveredBar.dayOnDayChange >= 0 ? `+${hoveredBar.dayOnDayChange}` : hoveredBar.dayOnDayChange}
                        {hoveredBar.growthPercentageDoD !== null && ` (${hoveredBar.growthPercentageDoD}%)`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabular Data Drilldown */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h3 className="font-semibold text-slate-900">Daily Breakdown Table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Notifications Created</th>
                <th className="px-6 py-3">Unique Users</th>
                <th className="px-6 py-3">Monitored Trains</th>
                <th className="px-6 py-3">DoD Change</th>
                <th className="px-6 py-3">DoD Growth %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...data].reverse().map((row) => (
                <tr key={row.date} className="transition hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-6 py-3.5 font-medium text-slate-900">
                    {moment(row.date).format("DD MMM YYYY")}
                  </td>
                  <td className="px-6 py-3.5 font-bold text-indigo-600">
                    {row.totalNotificationsCreated}
                  </td>
                  <td className="px-6 py-3.5 text-slate-700">{row.uniqueUsers}</td>
                  <td className="px-6 py-3.5 text-slate-700">{row.uniqueTrainsMonitored}</td>
                  <td className="px-6 py-3.5 font-medium">
                    {row.dayOnDayChange !== null ? (
                      <span className={row.dayOnDayChange >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {row.dayOnDayChange >= 0 ? `+${row.dayOnDayChange}` : row.dayOnDayChange}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 font-medium">
                    {row.growthPercentageDoD !== null ? (
                      <span className={row.growthPercentageDoD >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {row.growthPercentageDoD >= 0 ? `+${row.growthPercentageDoD}%` : `${row.growthPercentageDoD}%`}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
