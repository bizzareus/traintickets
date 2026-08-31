"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import moment from "moment";
import {
  Bell,
  Link2,
  MousePointerClick,
  Users,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  Laptop,
  Tablet,
  Bot,
  Mail,
  MessageSquare,
  Train,
  ArrowRight,
  Search,
  Calendar,
  X,
  TrendingUp,
} from "lucide-react";

// ==========================================
// 1. NOTIFICATIONS ANALYTICS TYPES
// ==========================================
type GroupByMode = "day" | "week" | "month";

type DailyStat = {
  date: string;
  totalNotificationsCreated: number;
  totalDelivered: number;
  whatsappDelivered: number;
  emailDelivered: number;
  deliveryRatePct: number;
  uniqueUsers: number;
  uniqueTrainsMonitored: number;
  dayOnDayChange: number | null;
  periodChange?: number | null;
  growthPercentageDoD: number | null;
  growthPercentage?: number | null;
};

type MonthlyRepeatUser = {
  month: string;
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  repeatUsersInMonth: number;
  singleAlertUsers: number;
  repeatUserRatePct: number;
  notificationsByRepeatUsers: number;
  totalNotifications: number;
  avgNotificationsPerRepeatUser: number;
};

type AnalyticsSummary = {
  totalNotifications: number;
  totalCreated: number;
  totalDelivered: number;
  totalWhatsappDelivered: number;
  totalEmailDelivered: number;
  overallDeliveryRate: number;
  totalDays: number;
  totalPeriods?: number;
  avgPerDay: number;
  avgPerPeriod?: number;
  peakDay: { date: string; count: number } | null;
  peakPeriod?: { date: string; count: number } | null;
};

type AnalyticsResponse = {
  groupBy?: GroupByMode;
  dailyStats: DailyStat[];
  stats?: DailyStat[];
  monthlyRepeatUsers?: MonthlyRepeatUser[];
  summary: AnalyticsSummary;
};

// ==========================================
// 2. SHORT LINKS & CLICKS TYPES
// ==========================================
type DeviceInfo = {
  browser: string;
  os: string;
  deviceType: "mobile" | "desktop" | "tablet" | "bot";
};

type UserInfo = {
  email: string | null;
  mobile: string | null;
  name: string | null;
  channel: string | null;
  recipient: string | null;
};

type TrainContextInfo = {
  trainNumber: string | null;
  trainName: string | null;
  fromStation: string | null;
  toStation: string | null;
  journeyDate: string | null;
  classCode: string | null;
  notificationType: string | null;
};

type ClickItem = {
  id: string;
  clickedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  device: DeviceInfo;
  shortLink: {
    id: string;
    code: string;
    shortUrl: string;
    targetUrl: string;
    clickCount: number;
    createdAt: string;
  } | null;
  user: UserInfo;
  trainContext: TrainContextInfo;
};

type ShortLinksOverviewSummary = {
  totalLinks: number;
  totalClicks: number;
  clickedLinksCount: number;
  unclickedLinksCount: number;
  clickThroughRate: number;
  uniqueUsersCount: number;
  recentClicks24h: number;
  recentClicks7d: number;
  clicksByChannel: { whatsapp: number; email: number; direct: number };
  linksByType: { search_redirect: number; chart_alert: number; other: number };
};

type ShortLinkDailyStat = {
  date: string;
  totalLinksCreated: number;
  totalClicks: number;
  uniqueLinksClicked: number;
  uniqueClickIps: number;
  searchLinksCreated: number;
  alertLinksCreated: number;
  whatsappClicks: number;
  emailClicks: number;
  ctrPct: number;
  createdChange: number | null;
  createdGrowthPct: number | null;
  clicksChange: number | null;
  clicksGrowthPct: number | null;
  periodChange?: number | null;
  growthPercentage?: number | null;
};

type ShortLinkDailySummary = {
  totalLinksCreated: number;
  totalClicks: number;
  totalWhatsappClicks: number;
  totalEmailClicks: number;
  overallCtrPct: number;
  totalDays: number;
  totalPeriods: number;
  avgLinksCreatedPerPeriod: number;
  avgClicksPerPeriod: number;
  peakCreationDay: { date: string; count: number } | null;
  peakClickDay: { date: string; count: number } | null;
};

type ShortLinkDailyStatsResponse = {
  groupBy: GroupByMode;
  dailyStats: ShortLinkDailyStat[];
  stats?: ShortLinkDailyStat[];
  summary: ShortLinkDailySummary;
};

// ==========================================
// MAIN ANALYTICS CONTAINER
// ==========================================
function AnalyticsDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get("tab") === "short-links" ? "short-links" : "notifications";
  const [activeTab, setActiveTab] = useState<"notifications" | "short-links">(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const handleTabChange = (tab: "notifications" | "short-links") => {
    setActiveTab(tab);
    router.replace(`/admin/analytics?tab=${tab}`);
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics & Insights</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track user notification volume, delivery performance, and real-time short link clicks.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-xl bg-slate-200/70 p-1 shadow-inner">
          <button
            onClick={() => handleTabChange("notifications")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === "notifications"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Bell className="h-4 w-4" />
            Notifications
          </button>
          <button
            onClick={() => handleTabChange("short-links")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === "short-links"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Link2 className="h-4 w-4" />
            Short Links
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "notifications" ? (
        <NotificationsAnalyticsSection />
      ) : (
        <ShortLinksSection />
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      }
    >
      <AnalyticsDashboard />
    </Suspense>
  );
}

// ==========================================
// TAB 1: NOTIFICATIONS ANALYTICS
// ==========================================
function NotificationsAnalyticsSection() {
  const [data, setData] = useState<DailyStat[]>([]);
  const [monthlyRepeatUsers, setMonthlyRepeatUsers] = useState<MonthlyRepeatUser[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aggregation & Date range controls
  const [groupBy, setGroupBy] = useState<GroupByMode>("day");
  const [preset, setPreset] = useState<"7d" | "14d" | "30d" | "90d" | "all" | "custom">("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Tooltip state
  const [hoveredBar, setHoveredBar] = useState<DailyStat | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Preset Date range calculation
  useEffect(() => {
    if (preset === "custom") return;
    const end = moment().format("YYYY-MM-DD");
    let start = "";
    if (preset === "7d") start = moment().subtract(6, "days").format("YYYY-MM-DD");
    else if (preset === "14d") start = moment().subtract(13, "days").format("YYYY-MM-DD");
    else if (preset === "30d") start = moment().subtract(29, "days").format("YYYY-MM-DD");
    else if (preset === "90d") start = moment().subtract(89, "days").format("YYYY-MM-DD");
    else if (preset === "all") start = "";

    setStartDate(start);
    setEndDate(start ? end : "");
  }, [preset]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("groupBy", groupBy);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient.get<AnalyticsResponse>(
        `/api/availability/admin/notifications-analytics${queryStr}`
      );

      const items = res.data.stats || res.data.dailyStats || [];
      setData(items);
      setMonthlyRepeatUsers(res.data.monthlyRepeatUsers || []);
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
  }, [groupBy, startDate, endDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const maxVal = useMemo(() => {
    if (!data.length) return 10;
    const max = Math.max(
      ...data.map((d) => Math.max(d.totalNotificationsCreated, d.totalDelivered || 0))
    );
    return max === 0 ? 10 : Math.ceil(max * 1.15);
  }, [data]);

  const formatBarLabel = (dateStr: string) => {
    if (groupBy === "month") return moment(dateStr).format("MMM YY");
    if (groupBy === "week") return moment(dateStr).format("DD MMM");
    return moment(dateStr).format("DD MMM");
  };

  const formatTooltipDate = (dateStr: string) => {
    if (groupBy === "month") return moment(dateStr).format("MMMM YYYY");
    if (groupBy === "week") return `Week of ${moment(dateStr).format("DD MMM YYYY")}`;
    return moment(dateStr).format("ddd, DD MMM YYYY");
  };

  const formatTableDate = (dateStr: string) => {
    if (groupBy === "month") return moment(dateStr).format("MMMM YYYY");
    if (groupBy === "week") return `Week of ${moment(dateStr).format("DD MMM YYYY")}`;
    return moment(dateStr).format("DD MMM YYYY");
  };

  const periodTitle =
    groupBy === "month"
      ? "Month-on-Month"
      : groupBy === "week"
        ? "Week-on-Week"
        : "Day-on-Day";
  const periodShortLabel =
    groupBy === "month" ? "MoM" : groupBy === "week" ? "WoW" : "DoD";

  return (
    <div className="space-y-6">
      {/* Date Range & Preset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Preset Range:</span>
          <div className="flex items-center gap-1.5">
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

        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Controls Bar: Group By & Date Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium text-slate-600 shadow-sm">
        {/* Aggregation Toggle */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">Group By:</span>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(
              [
                { key: "day", label: "Day on Day (DoD)" },
                { key: "week", label: "Week on Week (WoW)" },
                { key: "month", label: "Month on Month (MoM)" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setGroupBy(item.key)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  groupBy === item.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Filters */}
        <div className="flex flex-wrap items-center gap-3">
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
              Reset
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Total Created</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {summary.totalCreated ?? summary.totalNotifications}
            </p>
            <span className="text-[10px] text-slate-400">
              Across {summary.totalPeriods ?? summary.totalDays} {groupBy}s
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Delivered</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                {summary.overallDeliveryRate}% rate
              </span>
            </div>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{summary.totalDelivered}</p>
            <span className="text-[10px] text-slate-400">
              WA: {summary.totalWhatsappDelivered || 0} • Email: {summary.totalEmailDelivered || 0}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">
              {groupBy === "month" ? "Monthly" : groupBy === "week" ? "Weekly" : "Daily"} Average
            </span>
            <p className="mt-1 text-2xl font-bold text-indigo-600">
              {summary.avgPerPeriod ?? summary.avgPerDay}
            </p>
            <span className="text-[10px] text-slate-400">Created per {groupBy}</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium text-slate-500">
              Peak {groupBy === "month" ? "Month" : groupBy === "week" ? "Week" : "Day"}
            </span>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {(summary.peakPeriod || summary.peakDay)?.count ?? 0}
            </p>
            {(summary.peakPeriod || summary.peakDay) && (
              <span className="text-[10px] text-slate-400">
                {formatTableDate((summary.peakPeriod || summary.peakDay)!.date)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Bar Chart Section */}
      <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {periodTitle} Created vs. Delivered Notifications
            </h2>
            <span className="text-xs text-slate-400">Hover over bars for details</span>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-indigo-500" />
              <span className="text-slate-700">Created</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span className="text-slate-700">Delivered</span>
            </div>
          </div>
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
            No notification data found for the selected date range and grouping.
          </div>
        ) : (
          <div className="relative">
            {/* SVG Grouped Bar Chart */}
            <div className="relative h-72 w-full overflow-x-auto">
              <div className="flex h-full min-w-full items-end gap-3 pt-8 pb-8">
                {data.map((item) => {
                  const createdHeight = Math.max(
                    item.totalNotificationsCreated > 0 ? 4 : 0,
                    Math.round((item.totalNotificationsCreated / maxVal) * 100)
                  );
                  const deliveredHeight = Math.max(
                    item.totalDelivered > 0 ? 4 : 0,
                    Math.round((item.totalDelivered / maxVal) * 100)
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

                      {/* Grouped Bars Container */}
                      <div className="w-full flex-1 flex items-end justify-center gap-1">
                        {/* Created Bar */}
                        <div
                          style={{ height: `${createdHeight}%` }}
                          className={`w-full max-w-[18px] rounded-t-md transition-all duration-200 ${
                            isHovered
                              ? "bg-indigo-600 shadow-md"
                              : "bg-indigo-500/85 hover:bg-indigo-600"
                          }`}
                        />
                        {/* Delivered Bar */}
                        <div
                          style={{ height: `${deliveredHeight}%` }}
                          className={`w-full max-w-[18px] rounded-t-md transition-all duration-200 ${
                            isHovered
                              ? "bg-emerald-600 shadow-md"
                              : "bg-emerald-500/85 hover:bg-emerald-600"
                          }`}
                        />
                      </div>

                      {/* X Axis Label */}
                      <span className="mt-2 text-[10px] font-medium text-slate-400 group-hover:text-slate-700 whitespace-nowrap">
                        {formatBarLabel(item.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover Tooltip Popup */}
            {hoveredBar && hoverPos && (
              <div
                className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-white shadow-xl transition-all min-w-[220px]"
                style={{ left: hoverPos.x, top: hoverPos.y }}
              >
                <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5">
                  {formatTooltipDate(hoveredBar.date)}
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Created:</span>
                    <span className="font-bold text-indigo-400">
                      {hoveredBar.totalNotificationsCreated}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Delivered:</span>
                    <span className="font-bold text-emerald-400">
                      {hoveredBar.totalDelivered} ({hoveredBar.deliveryRatePct}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 pl-2">
                    <span>• WhatsApp: {hoveredBar.whatsappDelivered || 0}</span>
                    <span>• Email: {hoveredBar.emailDelivered || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-1">
                    <span className="text-slate-400">Unique Users:</span>
                    <span className="font-bold text-slate-200">
                      {hoveredBar.uniqueUsers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Trains Monitored:</span>
                    <span className="font-bold text-amber-400">
                      {hoveredBar.uniqueTrainsMonitored}
                    </span>
                  </div>
                  {(hoveredBar.periodChange ?? hoveredBar.dayOnDayChange) !== null &&
                    (hoveredBar.periodChange ?? hoveredBar.dayOnDayChange) !== undefined && (
                      <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-1">
                        <span className="text-slate-400">{periodShortLabel} Growth:</span>
                        <span
                          className={`font-bold ${
                            (hoveredBar.periodChange ?? hoveredBar.dayOnDayChange)! >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {(hoveredBar.periodChange ?? hoveredBar.dayOnDayChange)! >= 0
                            ? `+${hoveredBar.periodChange ?? hoveredBar.dayOnDayChange}`
                            : hoveredBar.periodChange ?? hoveredBar.dayOnDayChange}
                          {(hoveredBar.growthPercentage ?? hoveredBar.growthPercentageDoD) !== null &&
                            ` (${hoveredBar.growthPercentage ?? hoveredBar.growthPercentageDoD}%)`}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabular Data Drilldown: Timeline Breakdown */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{periodTitle} Timeline Breakdown</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical notification creation & delivery performance.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Grouped by {groupBy === "month" ? "Month" : groupBy === "week" ? "Week" : "Day"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
              <tr>
                <th className="px-6 py-3">
                  {groupBy === "month" ? "Month" : groupBy === "week" ? "Week Start" : "Date"}
                </th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Delivered</th>
                <th className="px-6 py-3">Delivery Rate</th>
                <th className="px-6 py-3">WhatsApp</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Unique Users</th>
                <th className="px-6 py-3">Monitored Trains</th>
                <th className="px-6 py-3">{periodShortLabel} Growth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...data].reverse().map((row) => {
                const change = row.periodChange ?? row.dayOnDayChange;
                const growth = row.growthPercentage ?? row.growthPercentageDoD;

                return (
                  <tr key={row.date} className="transition hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-3.5 font-medium text-slate-900">
                      {formatTableDate(row.date)}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-indigo-600">
                      {row.totalNotificationsCreated}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-emerald-600">
                      {row.totalDelivered}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                          row.deliveryRatePct >= 80
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : row.deliveryRatePct >= 50
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.deliveryRatePct}%
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">{row.whatsappDelivered || 0}</td>
                    <td className="px-6 py-3.5 text-slate-700">{row.emailDelivered || 0}</td>
                    <td className="px-6 py-3.5 text-slate-700">{row.uniqueUsers}</td>
                    <td className="px-6 py-3.5 text-slate-700">{row.uniqueTrainsMonitored}</td>
                    <td className="px-6 py-3.5 font-medium">
                      {growth !== null && growth !== undefined ? (
                        <span className={growth >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {change !== null && change !== undefined && (change >= 0 ? `+${change} ` : `${change} `)}
                          ({growth >= 0 ? `+${growth}%` : `${growth}%`})
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Repeat Users Table */}
      {monthlyRepeatUsers.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <h3 className="font-semibold text-slate-900">Monthly Repeat Users Analysis</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Breakdown of users setting up multiple notifications (≥ 2 alerts) and returning users by month.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
              {monthlyRepeatUsers.length} Months Tracked
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
                <tr>
                  <th className="px-6 py-3">Month</th>
                  <th className="px-6 py-3">Total Active Users</th>
                  <th className="px-6 py-3">Repeat Users (≥ 2 Alerts)</th>
                  <th className="px-6 py-3">Single Alert Users (1)</th>
                  <th className="px-6 py-3">Monthly Repeat Rate</th>
                  <th className="px-6 py-3">New vs Returning</th>
                  <th className="px-6 py-3">Alerts by Repeat Users</th>
                  <th className="px-6 py-3">Avg Alerts / Repeat User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyRepeatUsers.map((m) => (
                  <tr key={m.month} className="transition hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-3.5 font-bold text-slate-900">
                      {moment(m.month).format("MMMM YYYY")}
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800">
                      {m.totalUsers}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-indigo-600">
                      {m.repeatUsersInMonth}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      {m.singleAlertUsers}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                          m.repeatUserRatePct >= 50
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : m.repeatUserRatePct >= 25
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.repeatUserRatePct}%
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-100">
                          {m.newUsers} New
                        </span>
                        {m.returningUsers > 0 && (
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium border border-purple-100">
                            {m.returningUsers} Returning
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-800">
                      {m.notificationsByRepeatUsers}{" "}
                      <span className="text-xs text-slate-400 font-normal">
                        ({Math.round((m.notificationsByRepeatUsers / (m.totalNotifications || 1)) * 100)}% of total)
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-900">
                      {m.avgNotificationsPerRepeatUser}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// TAB 2: SHORT LINKS (CONTAINER WITH SUB-TABS)
// ==========================================
function ShortLinksSection() {
  const searchParams = useSearchParams();
  const initialView =
    searchParams.get("view") === "clickstream" ? "clickstream" : "graph";
  const [subTab, setSubTab] = useState<"graph" | "clickstream">(initialView);

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-200/70 p-1 shadow-inner">
            <button
              onClick={() => setSubTab("graph")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                subTab === "graph"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Day-on-Day Graph
            </button>
            <button
              onClick={() => setSubTab("clickstream")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                subTab === "clickstream"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              Clickstream Feed
            </button>
          </div>
        </div>

        <span className="text-xs text-slate-500">
          {subTab === "graph"
            ? "Aggregated link creation vs. real click engagement trends over time."
            : "Live telemetry and telemetry stream of recent short link click events."}
        </span>
      </div>

      {subTab === "graph" ? (
        <ShortLinksDailyGraphSection />
      ) : (
        <ShortLinksClicksSection />
      )}
    </div>
  );
}

// ==========================================
// TAB 2A: SHORT LINKS DAY-ON-DAY GRAPH
// ==========================================
function ShortLinksDailyGraphSection() {
  const [data, setData] = useState<ShortLinkDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupBy, setGroupBy] = useState<GroupByMode>("day");
  const [preset, setPreset] = useState<"7d" | "14d" | "30d" | "90d" | "all">("30d");

  // Tooltip state
  const [hoveredBar, setHoveredBar] = useState<ShortLinkDailyStat | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Preset Date range calculation
  const { startDate, endDate } = useMemo(() => {
    const end = moment().format("YYYY-MM-DD");
    let start = "";
    if (preset === "7d") start = moment().subtract(6, "days").format("YYYY-MM-DD");
    else if (preset === "14d") start = moment().subtract(13, "days").format("YYYY-MM-DD");
    else if (preset === "30d") start = moment().subtract(29, "days").format("YYYY-MM-DD");
    else if (preset === "90d") start = moment().subtract(89, "days").format("YYYY-MM-DD");
    else if (preset === "all") start = "";

    return { startDate: start, endDate: start ? end : "" };
  }, [preset]);

  const fetchDailyStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("groupBy", groupBy);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient.get<ShortLinkDailyStatsResponse>(
        `/api/short-link/admin/stats${queryStr}`
      );

      const items = res.data.stats || res.data.dailyStats || [];
      setData(items);
    } catch (err: unknown) {
      console.error("Failed to fetch short link daily stats", err);
      const isNetworkErr =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ERR_NETWORK";
      setError(
        isNetworkErr
          ? "Network Error: Unable to connect to backend server. Please ensure the API service is running."
          : "Failed to load daily short link statistics from server."
      );
    } finally {
      setLoading(false);
    }
  }, [groupBy, startDate, endDate]);

  useEffect(() => {
    fetchDailyStats();
  }, [fetchDailyStats]);

  const maxVal = useMemo(() => {
    if (!data.length) return 10;
    const max = Math.max(
      ...data.map((d) => Math.max(d.totalLinksCreated, d.totalClicks || 0))
    );
    return max === 0 ? 10 : Math.ceil(max * 1.15);
  }, [data]);

  const formatBarLabel = (dateStr: string) => {
    if (groupBy === "month") return moment(dateStr).format("MMM YY");
    if (groupBy === "week") return moment(dateStr).format("DD MMM");
    return moment(dateStr).format("DD MMM");
  };

  const formatTooltipDate = (dateStr: string) => {
    if (groupBy === "month") return moment(dateStr).format("MMMM YYYY");
    if (groupBy === "week") return `Week of ${moment(dateStr).format("DD MMM YYYY")}`;
    return moment(dateStr).format("ddd, DD MMM YYYY");
  };

  const periodTitle =
    groupBy === "month"
      ? "Month-on-Month"
      : groupBy === "week"
        ? "Week-on-Week"
        : "Day-on-Day";

  return (
    <div className="space-y-4">
      {/* Date Range & Grouping Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Range:</span>
          <div className="flex items-center gap-1.5">
            {(["7d", "14d", "30d", "90d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
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

        {/* Group By Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Group By:</span>
          <div className="inline-flex rounded-xl bg-slate-200/70 p-1 shadow-inner">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                  groupBy === mode
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={fetchDailyStats}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Day-on-Day Bar Chart */}
      <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {periodTitle} Links Generated vs. Clicks
            </h2>
            <span className="text-xs text-slate-400">Hover over bars for details</span>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-indigo-500" />
              <span className="text-slate-700">Links Generated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span className="text-slate-700">Links Clicked</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-rose-600 font-medium">{error}</p>
            <button
              onClick={fetchDailyStats}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Retry Connection
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            No short link activity recorded for the selected date range and grouping.
          </div>
        ) : (
          <div className="relative">
            {/* SVG Grouped Bar Chart */}
            <div className="relative h-72 w-full overflow-x-auto">
              <div className="flex h-full min-w-full items-end gap-3 pt-8 pb-8">
                {data.map((item) => {
                  const createdHeight = Math.max(
                    item.totalLinksCreated > 0 ? 4 : 0,
                    Math.round((item.totalLinksCreated / maxVal) * 100)
                  );
                  const clickedHeight = Math.max(
                    item.totalClicks > 0 ? 4 : 0,
                    Math.round((item.totalClicks / maxVal) * 100)
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
                        {item.totalLinksCreated}
                      </span>

                      {/* Grouped Bars Container */}
                      <div className="w-full flex-1 flex items-end justify-center gap-1">
                        {/* Created Bar */}
                        <div
                          style={{ height: `${createdHeight}%` }}
                          className={`w-full max-w-[18px] rounded-t-md transition-all duration-200 ${
                            isHovered
                              ? "bg-indigo-600 shadow-md"
                              : "bg-indigo-500/85 hover:bg-indigo-600"
                          }`}
                        />
                        {/* Clicked Bar */}
                        <div
                          style={{ height: `${clickedHeight}%` }}
                          className={`w-full max-w-[18px] rounded-t-md transition-all duration-200 ${
                            isHovered
                              ? "bg-emerald-600 shadow-md"
                              : "bg-emerald-500/85 hover:bg-emerald-600"
                          }`}
                        />
                      </div>

                      {/* X Axis Label */}
                      <span className="mt-2 text-[10px] font-medium text-slate-400 group-hover:text-slate-700 whitespace-nowrap">
                        {formatBarLabel(item.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover Tooltip Popup */}
            {hoveredBar && hoverPos && (
              <div
                className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-xs text-white shadow-xl transition-all min-w-[170px]"
                style={{ left: hoverPos.x, top: hoverPos.y }}
              >
                <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5">
                  {formatTooltipDate(hoveredBar.date)}
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Generated:</span>
                    <span className="font-bold text-indigo-400">
                      {hoveredBar.totalLinksCreated}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Clicks:</span>
                    <span className="font-bold text-emerald-400">
                      {hoveredBar.totalClicks}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// TAB 2B: SHORT LINKS CLICKS (CLICKSTREAM)
// ==========================================
function ShortLinksClicksSection() {
  const [overview, setOverview] = useState<ShortLinksOverviewSummary | null>(null);
  const [clicks, setClicks] = useState<ClickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowIst, setNowIst] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [preset, setPreset] = useState<"24h" | "7d" | "30d" | "all" | "custom">("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Live IST Clock
  useEffect(() => {
    const update = () => {
      setNowIst(moment().utcOffset("+05:30").format("DD MMM, HH:mm:ss") + " IST");
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Preset Date range
  useEffect(() => {
    if (preset === "custom") return;
    const end = moment().format("YYYY-MM-DD");
    let start = "";
    if (preset === "24h") {
      start = moment().subtract(1, "days").format("YYYY-MM-DD");
    } else if (preset === "7d") {
      start = moment().subtract(6, "days").format("YYYY-MM-DD");
    } else if (preset === "30d") {
      start = moment().subtract(29, "days").format("YYYY-MM-DD");
    } else if (preset === "all") {
      start = "";
    }
    setStartDate(start);
    setEndDate(start ? end : "");
    setPage(1);
  }, [preset]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (search.trim()) params.append("search", search.trim());
      if (channelFilter !== "all") params.append("channel", channelFilter);
      params.append("page", String(page));
      params.append("limit", "25");

      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const [ovRes, clickRes] = await Promise.all([
        apiClient.get<{ summary: ShortLinksOverviewSummary }>(
          `/api/short-link/admin/overview${queryStr}`
        ),
        apiClient.get<{ clicks: ClickItem[]; total: number; totalPages: number }>(
          `/api/short-link/admin/clicks${queryStr}`
        ),
      ]);

      setOverview(ovRes.data.summary);
      setClicks(clickRes.data.clicks);
      setTotalCount(clickRes.data.total);
      setTotalPages(clickRes.data.totalPages);
    } catch (err) {
      console.error("Failed to load short link clicks data", err);
      setError("Failed to load short link tracking data. Check if backend API is running.");
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, search, channelFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyToClipboard = (text: string, code: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-3.5 w-3.5 text-blue-500" />;
      case "tablet":
        return <Tablet className="h-3.5 w-3.5 text-purple-500" />;
      case "bot":
        return <Bot className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <Laptop className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls & Clock Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            IST Time: {nowIst}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5">
            {(["24h", "7d", "30d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  preset === p
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p === "24h" && "24 Hours"}
                {p === "7d" && "7 Days"}
                {p === "30d" && "30 Days"}
                {p === "all" && "All Time"}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Short Links</span>
              <Link2 className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{overview.totalLinks}</p>
            <span className="text-[11px] text-slate-400">
              {overview.linksByType.search_redirect} Search • {overview.linksByType.chart_alert} Alerts
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Click Events</span>
              <MousePointerClick className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{overview.totalClicks}</p>
            <span className="text-[11px] text-slate-400">
              {overview.recentClicks24h} in 24h • {overview.recentClicks7d} in 7d
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Click-Through Rate</span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                {overview.clickThroughRate}% CTR
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-indigo-600">{overview.clickedLinksCount}</p>
            <span className="text-[11px] text-slate-400">
              links clicked of {overview.totalLinks} created
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Identified Contacts</span>
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-purple-600">{overview.uniqueUsersCount}</p>
            <span className="text-[11px] text-slate-400">
              WA: {overview.clicksByChannel.whatsapp} • Email: {overview.clicksByChannel.email} clicks
            </span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs shadow-sm">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by email, mobile, name, train number, or code..."
            className="w-full bg-transparent text-slate-800 focus:outline-none placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Channel:</span>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset("custom");
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset("custom");
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Clicks Feed Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
            <p className="text-xs text-slate-500">Loading click events...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Clicks Stream ({totalCount})</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed telemetry of users who clicked short links sent across notification channels.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-700">
                <tr>
                  <th className="px-6 py-3.5">Time (IST)</th>
                  <th className="px-6 py-3.5">User / Recipient</th>
                  <th className="px-6 py-3.5">Channel</th>
                  <th className="px-6 py-3.5">Train & Route Context</th>
                  <th className="px-6 py-3.5">Short Link & Destination</th>
                  <th className="px-6 py-3.5">Device & Browser</th>
                  <th className="px-6 py-3.5">IP & Referrer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clicks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No short link clicks recorded for this criteria.
                    </td>
                  </tr>
                ) : (
                  clicks.map((c) => (
                    <tr key={c.id} className="transition hover:bg-slate-50/50">
                      {/* Time */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">
                            {moment.utc(c.clickedAt).utcOffset("+05:30").format("DD MMM, HH:mm:ss")}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {moment(c.clickedAt).fromNow()}
                          </span>
                        </div>
                      </td>

                      {/* User / Recipient */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          {c.user.name && (
                            <span className="font-bold text-slate-900 text-xs">
                              {c.user.name}
                            </span>
                          )}
                          {c.user.email && (
                            <span className="text-xs font-medium text-slate-800 flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {c.user.email}
                            </span>
                          )}
                          {c.user.mobile && (
                            <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                              <MessageSquare className="h-3 w-3 text-slate-400" />
                              {c.user.mobile}
                            </span>
                          )}
                          {!c.user.email && !c.user.mobile && !c.user.name && (
                            <span className="italic text-slate-400 text-xs">Anonymous Click</span>
                          )}
                        </div>
                      </td>

                      {/* Channel */}
                      <td className="px-6 py-4">
                        {c.user.channel === "whatsapp" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            <MessageSquare className="h-3 w-3" /> WhatsApp
                          </span>
                        ) : c.user.channel === "email" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                            <Mail className="h-3 w-3" /> Email
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Direct / Web
                          </span>
                        )}
                      </td>

                      {/* Train & Route Context */}
                      <td className="px-6 py-4">
                        {c.trainContext.trainNumber ? (
                          <div className="flex flex-col gap-0.5 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <Train className="h-3.5 w-3.5 text-indigo-600" />
                              <span>{c.trainContext.trainNumber}</span>
                              {c.trainContext.trainName && (
                                <span className="font-normal text-slate-500 truncate max-w-[120px]">
                                  ({c.trainContext.trainName})
                                </span>
                              )}
                            </div>
                            {c.trainContext.fromStation && c.trainContext.toStation && (
                              <div className="text-slate-600 flex items-center gap-1 text-[11px]">
                                <span>{c.trainContext.fromStation}</span>
                                <ArrowRight className="h-3 w-3 text-slate-400" />
                                <span>{c.trainContext.toStation}</span>
                                {c.trainContext.journeyDate && (
                                  <span className="text-slate-400 font-mono ml-1">
                                    • {moment(c.trainContext.journeyDate).format("DD MMM")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Short Link & Target */}
                      <td className="px-6 py-4">
                        {c.shortLink ? (
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                /s/{c.shortLink.code}
                              </span>
                              <button
                                onClick={() => copyToClipboard(c.shortLink!.shortUrl, c.shortLink!.code)}
                                className="text-slate-400 hover:text-slate-600"
                                title="Copy Short URL"
                              >
                                {copiedCode === c.shortLink.code ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            <a
                              href={c.shortLink.targetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 truncate max-w-[160px]"
                              title={c.shortLink.targetUrl}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span>{c.shortLink.targetUrl.replace(/^https?:\/\/[^/]+/, "")}</span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Device & Browser */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            {getDeviceIcon(c.device.deviceType)}
                            <span className="font-semibold text-slate-800">
                              {c.device.os}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 truncate max-w-[140px]" title={c.device.browser}>
                            {c.device.browser}
                          </span>
                        </div>
                      </td>

                      {/* IP & Referer */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          <span className="font-mono text-slate-700">{c.ipAddress || "—"}</span>
                          <span className="text-slate-400 truncate max-w-[120px]" title={c.referer || ""}>
                            {c.referer ? c.referer.replace(/^https?:\/\//, "") : "Direct"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({totalCount} items)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
